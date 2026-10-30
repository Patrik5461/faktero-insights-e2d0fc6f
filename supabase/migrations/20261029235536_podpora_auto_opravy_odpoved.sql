/*
  Odpoveď zákazníkovi po nasadení automatickej opravy.

  Keď je schválená oprava naozaj na faktero.sk, spúšťač (scripts/auto-oprava)
  požiada server o odpoveď: tá ide bežnou cestou odpovedí podpory (vlákno,
  e-mail, Telegram) a požiadavka sa uzavrie.

  - odpoved_zhrnutie: čo sa opravilo, slovami pre zákazníka (z návrhu agenta);
  - odpoved_text: text upravený podporou (null = predvolený zo zhrnutia);
  - odpoved_auto: podpora môže automatiku pri návrhu vypnúť;
  - nasadena_at, odpoved_odoslana_at, odpoved_chyba: priebeh.

  Staré riadky dostanú odpoved_auto = false — automat neodpovie spätne na
  nič, čo vzniklo pred touto funkciou.
*/
alter table public.podpora_auto_opravy
  add column if not exists odpoved_zhrnutie text,
  add column if not exists odpoved_text text,
  add column if not exists odpoved_auto boolean not null default true,
  add column if not exists nasadena_at timestamptz,
  add column if not exists odpoved_odoslana_at timestamptz,
  add column if not exists odpoved_chyba text;

update public.podpora_auto_opravy set odpoved_auto = false;

create index if not exists podpora_auto_opravy_odpoved_idx
  on public.podpora_auto_opravy (stav, nasadena_at)
  where odpoved_auto and odpoved_odoslana_at is null;
