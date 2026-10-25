-- OAuth 2.1 pre MCP server (napojenie claude.ai, ChatGPT…). Prístupový token je
-- obyčajný API kľúč s dobou platnosti, takže /api/v1 aj /api/mcp ho overia rovnako.
alter table public.api_keys add column if not exists expires_at timestamptz;

create table if not exists public.oauth_clients (
  client_id text primary key,
  client_name text,
  redirect_uris text[] not null,
  created_at timestamptz not null default now()
);
create table if not exists public.oauth_codes (
  code_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  redirect_uri text not null,
  code_challenge text not null,
  scope text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.oauth_refresh_tokens (
  token_hash text primary key,
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  api_key_id uuid references public.api_keys(id) on delete set null,
  scope text,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
alter table public.oauth_refresh_tokens enable row level security;
revoke all on public.oauth_clients, public.oauth_codes, public.oauth_refresh_tokens from public, anon, authenticated;
grant all on public.oauth_clients, public.oauth_codes, public.oauth_refresh_tokens to service_role;
