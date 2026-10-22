-- Foundable AI kit: search over the website's own tables, by words and by meaning in one ranked list, as the visitor.
-- Foundable keeps this file: apply it once, exactly as it is, with backend.apply_sql before a table is made searchable, and
-- again whenever select md5(prosrc) from pg_proc where oid = to_regprocedure('private.make_searchable(regclass,text[],regconfig)')
-- answers no row or another digest than the recipe names: a retyped setup can run a search as someone else, so no table is
-- made searchable until the digest matches. Then one call per table: select private.make_searchable('public.<table>', array['<column>', ...], '<language>').
create extension if not exists vector with schema extensions;
create schema if not exists private;
-- A text array's words for a generated column or a hash: array_to_string is only stable in general, but a text array's
-- text never depends on a setting, so this one use is immutable.
create or replace function private.words(text[]) returns text language sql immutable parallel safe set search_path = ''
  as $w$ select array_to_string($1, ' ') $w$;
-- Whoever writes a searchable row computes its words, so every role that writes may call this one function. The Data API
-- serves nothing in private, and make_searchable runs as its caller, so only the owner's own schema changes reach it.
grant usage on schema private to anon, authenticated, service_role;
grant execute on function private.words(text[]) to anon, authenticated, service_role;
-- Makes a public table searchable by words and by meaning: one generated column of its words (search_words), a side table
-- <table>_embeddings that shows a visitor exactly the rows the table shows them, and the functions the app calls. The
-- embeddings stay out of the table, so pages that read it whole download no vectors. Run it again after the searchable
-- columns change: the words follow at once, and every row whose text changed is embedded again on the next refresh.
create or replace function private.make_searchable(target regclass, text_columns text[], language regconfig default 'english')
returns void language plpgsql set search_path = '' as $fn$
declare
  t text; side text; key text; key_type text; vs text; col text; ord int; expr text;
  qualified text[] := '{}'; weighted text[] := '{}'; words text; text_s text;
begin
  select extnamespace::regnamespace::text into vs from pg_extension where extname = 'vector';
  if vs is null then raise exception 'make_searchable needs the vector extension'; end if;
  -- Reads one vector value, which loads pgvector into this session: PostgreSQL lets only a superuser store a setting for a
  -- library not yet loaded (the search functions' set hnsw.ef_search below), Supabase's postgres is no superuser, and each
  -- change Build sends runs in a session of its own (wave 0's P8: refused 42501 without this, three times out of three).
  execute format('select %L::%I.vector', '[0]', vs);
  select r.relname into t from pg_class r join pg_namespace n on n.oid = r.relnamespace
    where r.oid = target and n.nspname = 'public' and r.relkind in ('r', 'p');
  if t is null then raise exception 'make_searchable takes a table in public'; end if;
  side := t || '_embeddings';
  select a.attname, format_type(a.atttypid, a.atttypmod) into key, key_type
    from pg_index x join pg_attribute a on a.attrelid = x.indrelid and a.attnum = x.indkey[0]
    where x.indrelid = target and x.indisprimary and x.indnkeyatts = 1;
  if key is null then raise exception 'make_searchable needs a one-column primary key on %', t; end if;
  if coalesce(array_length(text_columns, 1), 0) = 0 then raise exception 'make_searchable needs at least one column'; end if;
  -- Each column as text in a generated column, which takes only immutable expressions: a text array through private.words,
  -- a type whose text never depends on a setting as itself, nothing else (a date or a time reads by the time zone).
  for col, ord in select u.c, u.o from unnest(text_columns) with ordinality u(c, o) loop
    expr := null;
    select case when ty.typcategory = 'A' and el.typcategory = 'S' then 'private.words(%s::text[])'
                when p.provolatile = 'i' then '%s::text' end into expr
      from pg_attribute a join pg_type ty on ty.oid = a.atttypid left join pg_type el on el.oid = ty.typelem
      join pg_proc p on p.oid = ty.typoutput
      where a.attrelid = target and a.attname = col and a.attnum > 0 and not a.attisdropped;
    if not found then raise exception 'make_searchable: % has no column %', t, col; end if;
    if expr is null then raise exception 'make_searchable: % reads by a setting (a date or a time); search a text column the app fills', col; end if;
    qualified := qualified || format('coalesce(' || expr || ', %L)', 's.' || quote_ident(col), '');
    weighted := weighted || format('setweight(to_tsvector(%L::regconfig, coalesce(' || expr || ', %L)), %L)',
      language::text, quote_ident(col), '', case ord when 1 then 'A' when 2 then 'B' else 'C' end);
  end loop;
  words := array_to_string(weighted, ' || ');
  text_s := array_to_string(qualified, ' || chr(10) || ');
  -- The words are stored: a visitor's search runs under row level security, where PostgreSQL never uses the words index
  -- (its match operator is not leakproof), so each search reads every row's words; computing them each time was about
  -- 13 times slower through this search on 20,000 rows.
  -- PostgreSQL 17 updates the derived values without replacing the column or losing its grants and dependents.
  if exists (select 1 from pg_attribute where attrelid = target and attname = 'search_words' and not attisdropped) then
    execute format('alter table public.%I alter column search_words set expression as (%s)', t, words);
  else
    execute format('alter table public.%I add column search_words tsvector generated always as (%s) stored', t, words);
  end if;
  execute format('create index if not exists %I on public.%I using gin (search_words)', t || '_search_words', t);
  execute format('create table if not exists public.%I (%I %s primary key references public.%I (%I) on delete cascade,'
    ' embedding %I.vector(512) not null, embedded_hash text not null)', side, key, key_type, t, key, vs);
  execute format('alter table public.%I enable row level security', side);
  execute format('drop policy if exists "rows its table shows" on public.%I', side);
  execute format('create policy "rows its table shows" on public.%I for select to anon, authenticated'
    ' using (exists (select 1 from public.%I s where s.%I = %I.%I))', side, t, key, side, key);
  execute format('grant select on public.%I to anon, authenticated', side);
  execute format('grant select, insert, update, delete on public.%I to service_role', side);
  execute format('create index if not exists %I on public.%I using hnsw (embedding %I.vector_cosine_ops)', side || '_hnsw', side, vs);
  -- Words and meaning, merged by reciprocal rank. The meaning side scans on past rows the caller may not see
  -- (iterative scan), so a visitor who sees few rows still gets their nearest ones.
  execute format($f$create or replace function public.%1$I(query text, query_embedding %5$I.vector(512) default null,
      match_count integer default 10) returns setof public.%2$I language sql stable
      set search_path = public, %5$I set hnsw.ef_search = 100 set hnsw.iterative_scan = relaxed_order as $q$
    with by_words as (
      select %3$I as id, row_number() over (order by ts_rank_cd(search_words, websearch_to_tsquery(%4$L::regconfig, query)) desc) as rank
      from public.%2$I where search_words @@ websearch_to_tsquery(%4$L::regconfig, query) order by rank limit 100),
    by_meaning as (
      select id, row_number() over (order by distance) as rank from (
        select %3$I as id, embedding <=> query_embedding as distance from public.%7$I
        where query_embedding is not null order by embedding <=> query_embedding limit 100) nearest)
    select found.* from (
      select coalesce(w.id, m.id) as id, coalesce(1.0 / (50 + w.rank), 0) + coalesce(1.0 / (50 + m.rank), 0) as score
      from by_words w full join by_meaning m on w.id = m.id order by score desc limit least(match_count, 100)) ranked
    join public.%2$I found on found.%3$I = ranked.id order by ranked.score desc $q$$f$,
    'search_' || t, t, key, language::text, vs, words, side);
  execute format($f$create or replace function public.%1$I(row_id %4$s, match_count integer default 6)
      returns setof public.%2$I language sql stable
      set search_path = public, %5$I set hnsw.ef_search = 100 set hnsw.iterative_scan = relaxed_order as $q$
    select found.* from (
      select e.%3$I as id, e.embedding <=> (select x.embedding from public.%6$I x where x.%3$I = row_id) as distance
      from public.%6$I e where e.%3$I <> row_id and exists (select 1 from public.%6$I x where x.%3$I = row_id)
      order by e.embedding <=> (select x.embedding from public.%6$I x where x.%3$I = row_id) limit least(match_count, 30)) near
    join public.%2$I found on found.%3$I = near.id order by near.distance $q$$f$, 'similar_' || t, t, key, key_type, vs, side);
  -- A row whose text to embed is blank (the columns' line breaks apart) is left out: OpenAI refuses an empty input, which
  -- would fail every batch holding it.
  execute format($f$create or replace function public.%1$I(batch integer default 100)
      returns table (id text, text text, hash text) language sql stable set search_path = public as $q$
    select s.%3$I::text, left(%5$s, 6000), md5(%5$s) from public.%2$I s left join public.%4$I e on e.%3$I = s.%3$I
    where e.embedded_hash is distinct from md5(%5$s) and btrim(left(%5$s, 6000), E' \t\r\n') <> '' limit least(batch, 500) $q$$f$, t || '_to_embed', t, key, side, text_s);
  execute format($f$create or replace function public.%1$I(items jsonb) returns integer language sql volatile
      set search_path = public, %5$I as $q$
    with saved as (
      insert into public.%4$I (%3$I, embedding, embedded_hash)
      select (item ->> 'id')::%6$s, (item ->> 'embedding')::%5$I.vector(512), item ->> 'hash' from jsonb_array_elements(items) item
      where exists (select 1 from public.%2$I s where s.%3$I = (item ->> 'id')::%6$s)
      on conflict (%3$I) do update set embedding = excluded.embedding, embedded_hash = excluded.embedded_hash returning 1)
    select count(*)::integer from saved $q$$f$, 'save_' || t || '_embeddings', t, key, side, vs, key_type);
  execute format('grant execute on function public.%I(text, %I.vector, integer) to anon, authenticated, service_role', 'search_' || t, vs);
  execute format('grant execute on function public.%I(%s, integer) to anon, authenticated, service_role', 'similar_' || t, key_type);
  -- Only the app's server code refreshes embeddings: a visitor who may edit a row must not plant one that ranks it first.
  execute format('revoke execute on function public.%I(integer), public.%I(jsonb) from public, anon, authenticated',
    t || '_to_embed', 'save_' || t || '_embeddings');
  execute format('grant execute on function public.%I(integer), public.%I(jsonb) to service_role', t || '_to_embed', 'save_' || t || '_embeddings');
end $fn$;
-- The setup's version, a label for people reading the database. What the recipe reads back before making a table
-- searchable is the digest of make_searchable's body (md5(prosrc)), since a retyped setup still carries this label.
comment on function private.make_searchable(regclass, text[], regconfig) is 'foundable-search 1';
