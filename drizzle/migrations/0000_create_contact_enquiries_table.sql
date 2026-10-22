create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320 and email like '%@%'),
  message text not null check (char_length(message) between 1 and 5000),
  created_at timestamptz not null default now()
);
alter table public.enquiries enable row level security;
create policy "anyone can send an enquiry" on public.enquiries for insert to anon, authenticated with check (true);
grant insert (name, email, message) on public.enquiries to anon, authenticated;
grant select, insert, update, delete on public.enquiries to service_role;
