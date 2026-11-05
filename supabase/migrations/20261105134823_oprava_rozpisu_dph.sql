-- Oprava rozpisu DPH vyťažených dokladov (2026-11-05).
--
-- Vyťaženie AI občas uložilo celý základ do jednej sadzby (0 % + 23 % →
-- „19 %“ z pomeru dane k základu). Opravný skript `scripts/oprava-rozpisu-dph.ts`
-- doklady prejde, chybné znova vyťaží a prepíše — no nesmie prepísať to, čo
-- opravil človek, a musí sa dať vrátiť. Čo pribudlo:
--
--   purchase_invoices.vat_breakdown  rozpis DPH po sadzbách [{sadzba, zaklad, dph, pdp?}]
--       (rovnaký tvar ako expense_documents.vat_breakdown; dobropis záporne).
--       Doteraz prijatá faktúra rozpis nemala — bez položiek sa sadzba
--       dopočítavala z pomeru a viac sadzieb splynulo do jednej.
--   rucne_upravene_at / rucne_upravil  (prijaté aj bločky) — kedy a kto naposledy
--       RUČNE zmenil sumy, DPH, sadzbu, položky, rozpis alebo prenesenie.
--       Nastavuje spúšťač `faktero_rucna_uprava_dph`: len keď zápis urobil
--       človek, appka alebo API (`faktero_kto_historie` → clovek/appka/api;
--       teda aj server s hlavičkou x-faktero-kto = adminZa(userId)). Zápis
--       vyťaženia a opravného skriptu (servisný kľúč bez hlavičky) ho nenastaví.
--       Vloženie (INSERT) ho nenastavuje — vytvorenie z Nespracovaných rieši kód.
--   na_kontrolu_at (bločky) + na_kontrolu_dovod (oba) — doklad čaká na
--       kontrolu človekom; dôvod „Rozpis DPH …“ odlišuje kontrolu rozpisu od
--       automaticky zaradenej eFaktúry (tá má dôvod prázdny).
--   oprava_rozpisu_dph_audit — pôvodné a nové hodnoty každej zmeny skriptu
--       (aj označenia na kontrolu), podľa run_id sa dá beh vrátiť
--       (`scripts/oprava-rozpisu-dph-rollback.ts`). Len pre service_role.
--
-- Migrácia je idempotentná.

/* ------------------------------------------------------------ 1) stĺpce */

alter table public.purchase_invoices add column if not exists vat_breakdown jsonb;
comment on column public.purchase_invoices.vat_breakdown is
  'Rozpis DPH po sadzbách [{sadzba, zaklad, dph, pdp?}] (dobropis záporne). Prednosť majú položky, ak sedia so sumami.';

alter table public.purchase_invoices add column if not exists rucne_upravene_at timestamptz;
alter table public.purchase_invoices add column if not exists rucne_upravil uuid;
alter table public.expense_documents add column if not exists rucne_upravene_at timestamptz;
alter table public.expense_documents add column if not exists rucne_upravil uuid;
comment on column public.purchase_invoices.rucne_upravene_at is
  'Kedy človek naposledy ručne zmenil sumy/DPH/položky/rozpis/prenesenie (spúšťač faktero_rucna_uprava_dph). Opravné skripty takýto doklad neprepisujú.';
comment on column public.expense_documents.rucne_upravene_at is
  'Kedy človek naposledy ručne zmenil sumy/DPH/sadzbu/položky/rozpis (spúšťač faktero_rucna_uprava_dph). Opravné skripty takýto doklad neprepisujú.';

alter table public.purchase_invoices add column if not exists na_kontrolu_at timestamptz;
alter table public.purchase_invoices add column if not exists na_kontrolu_dovod text;
alter table public.expense_documents add column if not exists na_kontrolu_at timestamptz;
alter table public.expense_documents add column if not exists na_kontrolu_dovod text;
comment on column public.purchase_invoices.na_kontrolu_dovod is
  'Prečo doklad čaká na kontrolu (napr. „Rozpis DPH …“). Prázdny pri automaticky zaradenej eFaktúre.';
comment on column public.expense_documents.na_kontrolu_dovod is
  'Prečo doklad čaká na kontrolu (napr. „Rozpis DPH …“).';

/* ----------------------------------------------- 2) príznak ručnej úpravy */

create or replace function public.faktero_rucna_uprava_dph()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
  _s text;
  _zmena boolean := false;
  _k record;
begin
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      _zmena := true;
      exit;
    end if;
  end loop;
  if not _zmena then
    return new;
  end if;
  -- Ten istý výklad „kto to bol“ ako história dokladu.
  select * into _k from public.faktero_kto_historie(_nove, _stare, false);
  if _k.typ in ('clovek', 'appka', 'api') then
    new.rucne_upravene_at := now();
    new.rucne_upravil := coalesce(_k.kto, auth.uid());
  end if;
  return new;
end
$$;

revoke all on function public.faktero_rucna_uprava_dph() from public;
revoke all on function public.faktero_rucna_uprava_dph() from anon, authenticated;

drop trigger if exists purchase_invoices_rucna_uprava on public.purchase_invoices;
create trigger purchase_invoices_rucna_uprava
  before update on public.purchase_invoices
  for each row execute function public.faktero_rucna_uprava_dph(
    'amount_without_vat', 'vat_amount', 'amount_total', 'items', 'vat_breakdown',
    'reverse_charge', 'reverse_charge_type', 'dph_rezim');

drop trigger if exists expense_documents_rucna_uprava on public.expense_documents;
create trigger expense_documents_rucna_uprava
  before update on public.expense_documents
  for each row execute function public.faktero_rucna_uprava_dph(
    'total_amount', 'net_amount', 'vat_amount', 'vat_rate', 'vat_breakdown', 'items');

/* ------------------------------------ 3) rozpis prijatej v zámkoch a fronte */

-- Uzavreté obdobie: rozpis po sadzbách mení priznanie rovnako ako sumy.
drop trigger if exists purchase_invoices_locked_period on public.purchase_invoices;
create trigger purchase_invoices_locked_period
  before insert or delete or update on public.purchase_invoices
  for each row execute function public.guard_locked_period(
    'issue_date', 'issue_date', 'received_date', 'povodna_splatnost', 'invoice_number',
    'supplier_name', 'supplier_ico', 'supplier_dic', 'supplier_ic_dph',
    'amount_without_vat', 'vat_amount', 'amount_total', 'vat_breakdown', 'currency', 'deleted_at');

-- Zmena rozpisu nezaúčtovanej faktúry ju vráti do fronty automatického zaúčtovania.
drop trigger if exists purchase_invoices_auto_uctovanie on public.purchase_invoices;
create trigger purchase_invoices_auto_uctovanie
  before update on public.purchase_invoices
  for each row execute function public.faktero_auto_uctovanie_strazca(
    'supplier_ico', 'supplier_name', 'supplier_ic_dph', 'supplier_country', 'amount_total',
    'amount_without_vat', 'vat_amount', 'items', 'vat_breakdown', 'type', 'reverse_charge',
    'reverse_charge_type', 'dph_rezim', 'eu_plnenie', 'osobitna_uprava', 'odpocet',
    'payment_method', 'status', 'intro_note');

/* ------------------------------------------------------- 4) audit tabuľka */

create table if not exists public.oprava_rozpisu_dph_audit (
  id bigint generated always as identity primary key,
  run_id text not null,
  tabulka text not null check (tabulka in ('purchase_invoices', 'expense_documents', 'nespracovane_doklady')),
  document_id uuid not null,
  company_id uuid,
  -- prepis = nové vyťaženie prepísalo rozpis/sumy; na_kontrolu = len príznak;
  -- rollback = vrátenie skôr zapísanej zmeny.
  akcia text not null check (akcia in ('prepis', 'na_kontrolu', 'rollback')),
  old_values jsonb not null,
  new_values jsonb not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists oprava_rozpisu_dph_audit_run_idx on public.oprava_rozpisu_dph_audit (run_id);
create index if not exists oprava_rozpisu_dph_audit_doklad_idx on public.oprava_rozpisu_dph_audit (document_id);
comment on table public.oprava_rozpisu_dph_audit is
  'Pôvodné a nové hodnoty zmien opravného skriptu rozpisu DPH (scripts/oprava-rozpisu-dph.ts). Len service_role.';

alter table public.oprava_rozpisu_dph_audit enable row level security;
-- Žiadna politika: klienti (anon, authenticated) nevidia nič, service_role RLS obchádza.
revoke all on table public.oprava_rozpisu_dph_audit from public;
revoke all on table public.oprava_rozpisu_dph_audit from anon, authenticated;
grant select, insert, delete on table public.oprava_rozpisu_dph_audit to service_role;

/* ------------------------------------------- 5) kategória riadkov DPH */

-- `vat_category` žije v riadkoch rozpisu a položiek (jsonb), nie v stĺpci:
--   expense_documents.vat_breakdown[] / purchase_invoices.vat_breakdown[]  — rozpis
--   purchase_invoices.items[] / expense_documents.items[]                   — položky
--   (Nespracované: udaje.rozpis[] — bez migrácie.)
-- Hodnoty: standard (23/19/5 %, CZ 21/12 %), out_of_scope (nie je predmetom
-- DPH — do priznania nevstupuje), exempt (oslobodené), reverse_charge
-- (prenesenie, § 69 ods. 12), needs_review (0 % bez známeho dôvodu).
--
-- Existujúcim riadkom bez kategórie sa doplní podľa sadzby: > 0 → standard,
-- riadok v prenesení (pdp, alebo prijatá faktúra s reverse_charge — samozdanenie
-- vrátane EÚ) → reverse_charge,
-- 0 % → needs_review. Riadky, ktoré kategóriu už majú, sa nemenia.
--
-- Doplnenie beží s vypnutými spúšťačmi (user): guard uzavretého obdobia by
-- zmenu rozpisu v zamknutom období odmietol, história by narástla o tisíce
-- riadkov a `updated_at` by sa pohol (opravný skript podľa neho odhaduje
-- ručné úpravy). Hodnoty súm sa nemenia — je to len doplnenie značky.

create or replace function public.faktero_doplnit_kategoriu_dph(
  _riadky jsonb,
  _kluc_sadzby text,
  _cele_prenesenie boolean
) returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when _riadky is null or jsonb_typeof(_riadky) <> 'array' then _riadky
    else coalesce((
      select jsonb_agg(
        case
          when jsonb_typeof(r) <> 'object' or r ? 'vat_category' then r
          when coalesce(r ->> _kluc_sadzby, '') !~ '^-?[0-9]+([.][0-9]+)?$' then r
          else r || jsonb_build_object('vat_category',
            case
              when r -> 'pdp' = 'true'::jsonb or r -> 'prenesenie' = 'true'::jsonb then 'reverse_charge'
              when (r ->> _kluc_sadzby)::numeric > 0 then 'standard'
              when _cele_prenesenie then 'reverse_charge'
              else 'needs_review'
            end)
        end
        order by t.poradie)
      from jsonb_array_elements(_riadky) with ordinality as t(r, poradie)
    ), _riadky)
  end
$$;
revoke all on function public.faktero_doplnit_kategoriu_dph(jsonb, text, boolean) from public;
revoke all on function public.faktero_doplnit_kategoriu_dph(jsonb, text, boolean) from anon, authenticated;

alter table public.expense_documents disable trigger user;
update public.expense_documents
   set vat_breakdown = public.faktero_doplnit_kategoriu_dph(vat_breakdown, 'sadzba', false),
       items = public.faktero_doplnit_kategoriu_dph(items, 'vat_rate', false)
 where (jsonb_typeof(vat_breakdown) = 'array'
        and public.faktero_doplnit_kategoriu_dph(vat_breakdown, 'sadzba', false) is distinct from vat_breakdown)
    or (jsonb_typeof(items) = 'array'
        and public.faktero_doplnit_kategoriu_dph(items, 'vat_rate', false) is distinct from items);
alter table public.expense_documents enable trigger user;

alter table public.purchase_invoices disable trigger user;
update public.purchase_invoices
   set items = public.faktero_doplnit_kategoriu_dph(
         items, 'vat_rate',
         coalesce(reverse_charge, false))
 where jsonb_typeof(items) = 'array'
   and public.faktero_doplnit_kategoriu_dph(
         items, 'vat_rate',
         coalesce(reverse_charge, false)) is distinct from items;
alter table public.purchase_invoices enable trigger user;
