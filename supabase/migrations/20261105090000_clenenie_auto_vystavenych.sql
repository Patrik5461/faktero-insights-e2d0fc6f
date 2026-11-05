-- Automatické členenie DPH, KV DPH a predkontácia vystavených dokladov.
--
-- Logika je jediná, v TypeScripte: `resolveVatClassification`
-- (src/lib/faktero/clenenie-vystavenej.ts), zápis `uplatniClenenieFaktury`
-- (clenenie-vystavenej.server.ts). Databáza si len pamätá:
--   *_zdroj            — hodnota je 'auto' (automatika ju pri zmene dokladu
--                        prepočíta) alebo 'rucne' (zadal ju človek, nemení sa).
--                        NULL = zatiaľ nerozhodnuté: prázdna hodnota alebo
--                        hodnota zhodná s automatikou je automatická, iná ručná.
--   clenenie_auto_at   — kedy automatika doklad naposledy prešla. NULL = treba
--                        prejsť (nový doklad alebo zmena údajov, od ktorých
--                        členenie závisí) — zoberie ho fronta automatického
--                        účtovania (cron každú minútu), aj keď zápis prišiel
--                        cestou, ktorá automatiku nevolá.
--
-- Existujúce doklady dostanú clenenie_auto_at = čas migrácie (rýchly default,
-- bez prepisu tabuľky a bez spúšťačov) — fronta ich teda NEPREPOČÍTA. Doplnenie
-- starých dokladov je samostatný backfill (scripts/backfill-clenenie-vystavenych.ts),
-- ktorý spúšťa koordinátor po schválení.
--
-- Len súbor — aplikuje sa spolu s nasadením (faktero-migracie-verzie-nesedia:
-- cez MCP apply_migration a súbor premenovať na zapísanú verziu).

alter table public.invoices
  add column if not exists clenenie_zdroj text,
  add column if not exists kv_zdroj text,
  add column if not exists predkontacia_zdroj text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_clenenie_zdroj_check') then
    alter table public.invoices
      add constraint invoices_clenenie_zdroj_check check (clenenie_zdroj in ('auto', 'rucne')),
      add constraint invoices_kv_zdroj_check check (kv_zdroj in ('auto', 'rucne')),
      add constraint invoices_predkontacia_zdroj_check check (predkontacia_zdroj in ('auto', 'rucne'));
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'clenenie_auto_at'
  ) then
    -- now() je STABLE → rýchly default: existujúce riadky dostanú čas migrácie bez prepisu tabuľky.
    alter table public.invoices add column clenenie_auto_at timestamptz default now();
    alter table public.invoices alter column clenenie_auto_at drop default;
  end if;
end $$;

comment on column public.invoices.clenenie_zdroj is
  'Členenie DPH: auto = z automatiky (prepočíta sa), rucne = zadané človekom; NULL = podľa zhody s automatikou.';
comment on column public.invoices.kv_zdroj is
  'Členenie KV DPH: auto | rucne (ako clenenie_zdroj).';
comment on column public.invoices.predkontacia_zdroj is
  'Predkontácia: auto | rucne (ako clenenie_zdroj).';
comment on column public.invoices.clenenie_auto_at is
  'Kedy automatika (resolveVatClassification) doklad naposledy prešla; NULL = čaká vo fronte.';

-- Fronta: len doklady, ktoré čakajú (malý čiastočný index).
create index if not exists invoices_clenenie_fronta
  on public.invoices (created_at)
  where clenenie_auto_at is null and exported_at is null and deleted_at is null;

/*
  Strážca: zmena kódov alebo údajov dokladu ho vráti do fronty.
   - Zápis automatiky posúva clenenie_auto_at dopredu — ten sa nechá tak.
   - Zmena členenia / KV / predkontácie inou cestou (človek, API, potvrdenie
     návrhu): zdroj sa zhodí na NULL — automatika potom rozhodne podľa zhody
     (rovnaká hodnota ako automatická = auto, iná = ručne) a viac ju nemení.
   - Zmena údajov v tg_argv (typ, prenesenie, odberateľ, DPH, opravovaná
     faktúra …) → do fronty, automatické hodnoty sa prepočítajú.
*/
create or replace function public.faktero_clenenie_vystavenej_strazca()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
  _s text;
begin
  if new.clenenie_auto_at is not null and new.clenenie_auto_at is distinct from old.clenenie_auto_at then
    return new;
  end if;
  -- Odovzdaný doklad automatika nemení.
  if new.exported_at is not null then
    return new;
  end if;
  if new.pohoda_clenenie_dph is distinct from old.pohoda_clenenie_dph then
    new.clenenie_zdroj := null;
    new.clenenie_auto_at := null;
  end if;
  if new.kv_clenenie is distinct from old.kv_clenenie then
    new.kv_zdroj := null;
    new.clenenie_auto_at := null;
  end if;
  if new.pohoda_predkontacia is distinct from old.pohoda_predkontacia then
    new.predkontacia_zdroj := null;
    new.clenenie_auto_at := null;
  end if;
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      new.clenenie_auto_at := null;
      exit;
    end if;
  end loop;
  return new;
end;
$function$;

drop trigger if exists invoices_clenenie_auto on public.invoices;
create trigger invoices_clenenie_auto
  before update on public.invoices
  for each row execute function public.faktero_clenenie_vystavenej_strazca(
    'type', 'company_id', 'customer_ico', 'customer_name', 'customer_dic', 'customer_ic_dph',
    'customer_country', 'vat_total', 'reverse_charge', 'reverse_charge_type', 'eu_plnenie',
    'osobitna_uprava', 'oss_country', 'opravuje_fakturu_id', 'pravidlo_id', 'deleted_at'
  );

revoke all on function public.faktero_clenenie_vystavenej_strazca() from public, anon, authenticated;
