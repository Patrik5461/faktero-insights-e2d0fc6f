/*
  Odpovede e-mailom do vlákna požiadavky.

  Každá požiadavka má vlastnú adresu na odpoveď `podpora-<token>@doklady.faktero.sk`.
  Token je tajný (adresa je zároveň heslo, rovnako ako pri dokladoch e-mailom) —
  číslo požiadavky by sa dalo uhádnuť a ktokoľvek by písal do cudzieho vlákna.

  `provider_email_id` drží id mailu od Resendu: webhook sa pri výpadku opakuje a
  tá istá odpoveď sa nesmie do vlákna zapísať dvakrát.
*/
alter table public.podpora_poziadavky
  add column if not exists odpoved_token text not null default encode(extensions.gen_random_bytes(9), 'hex');

create unique index if not exists podpora_poziadavky_odpoved_token_key
  on public.podpora_poziadavky (odpoved_token);

alter table public.podpora_spravy
  add column if not exists provider_email_id text,
  add column if not exists cez_email boolean not null default false;

create unique index if not exists podpora_spravy_provider_email_id_key
  on public.podpora_spravy (provider_email_id) where provider_email_id is not null;

-- Token nesmie čítať ani zákazník (RLS mu riadok ukáže): stačí odpovedať na e-mail.
revoke select on public.podpora_poziadavky from authenticated;
grant select (
  id, cislo, user_id, company_id, email, meno, predmet, kategoria, stav, zdroj, url, user_agent,
  posledna_sprava_at, posledna_od, zakaznik_videl_at, podpora_videla_at, created_at, updated_at
) on public.podpora_poziadavky to authenticated;
