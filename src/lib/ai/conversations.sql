-- Foundable AI kit: where a signed-in visitor's conversation with each AI feature is kept, one row per visitor and feature,
-- which only that visitor reads or writes (conversations.server.ts writes it as them). Foundable keeps this file: apply it
-- once, as it is, with backend.apply_sql before a feature that keeps a conversation is used.
create table public.ai_conversations (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  feature text not null,
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature)
);
alter table public.ai_conversations enable row level security;
create policy "visitors keep their own AI conversations" on public.ai_conversations for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.ai_conversations to authenticated, service_role;
