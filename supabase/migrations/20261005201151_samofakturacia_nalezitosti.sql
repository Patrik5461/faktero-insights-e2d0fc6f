-- Samofaktúra je faktúra dodávateľa — musí vedieť všetko, čo bežná faktúra
-- (§ 74 ods. 1): prenesenie daňovej povinnosti, osobitnú úpravu, jazyk, text
-- nad položkami a opravu dobropisom s odkazom na pôvodnú faktúru.
alter table public.purchase_invoices
  add column if not exists reverse_charge boolean not null default false,
  add column if not exists reverse_charge_type text,
  add column if not exists eu_plnenie text,
  add column if not exists osobitna_uprava text,
  add column if not exists intro_note text,
  add column if not exists language text,
  add column if not exists opravuje_id uuid references public.purchase_invoices(id) on delete set null;

alter table public.purchase_invoices drop constraint if exists purchase_invoices_reverse_charge_type_chk;
alter table public.purchase_invoices add constraint purchase_invoices_reverse_charge_type_chk
  check (reverse_charge_type is null or reverse_charge_type in ('domestic_69', 'eu_b2b'));
alter table public.purchase_invoices drop constraint if exists purchase_invoices_eu_plnenie_chk;
alter table public.purchase_invoices add constraint purchase_invoices_eu_plnenie_chk
  check (eu_plnenie is null or eu_plnenie in ('tovar', 'sluzba'));
alter table public.purchase_invoices drop constraint if exists purchase_invoices_osobitna_uprava_chk;
alter table public.purchase_invoices add constraint purchase_invoices_osobitna_uprava_chk
  check (osobitna_uprava is null or osobitna_uprava in ('65', '66_tovar', '66_umenie', '66_starozitnosti'));

create index if not exists purchase_invoices_opravuje_id_idx
  on public.purchase_invoices (opravuje_id) where opravuje_id is not null;
