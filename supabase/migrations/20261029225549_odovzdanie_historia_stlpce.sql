-- História odovzdania do účtovníctva a „Opraviť zaúčtovanie“ (P-1008, P-1009).
--
-- Doklad, ktorý raz odišiel z Faktera do Pohody, si to pamätá navždy: kedy
-- prvýkrát, koľkokrát, akou cestou (konektor / súbor / prenos / iná) a kedy ho
-- niekto vrátil na opravu. `exported_at` ostáva „je to teraz odovzdané“ — po
-- vrátení sa nuluje ako doteraz, aby ho konektor a balík poslali znova.
--
-- Stĺpce počíta spúšťač `faktero_historia_odovzdania` — zápis z aplikácie ich
-- neprepíše (pri UPDATE sa vždy vezmú zo starého riadku a upravia len pri
-- zmene `exported_at`).
--
-- „Opraviť zaúčtovanie“: `oprava_zauctovania_at` odomkne v zámku odovzdaného
-- dokladu len zaúčtovacie polia (predkontácia, členenie DPH a KV, stredisko,
-- činnosť, účtovná poznámka). Pohoda doklad z XML neprepíše (agenda faktúr ani
-- prijatých dokladov nemá v schéme `actionType`), takže doklad ostáva
-- odovzdaný a kódy treba prepísať v Pohode — `oprava_zauctovania_povodne`
-- drží, čo v Pohode je, aby to rozhranie vedelo povedať.

/* ------------------------------------------------------------------ 1) stĺpce */

alter table public.invoices
  add column if not exists prvy_export_at timestamptz,
  add column if not exists pocet_exportov integer not null default 0,
  add column if not exists export_cesta text,
  add column if not exists vratene_z_pohody_at timestamptz,
  add column if not exists oprava_zauctovania_at timestamptz,
  add column if not exists oprava_zauctovania_povodne jsonb;
alter table public.purchase_invoices
  add column if not exists prvy_export_at timestamptz,
  add column if not exists pocet_exportov integer not null default 0,
  add column if not exists export_cesta text,
  add column if not exists vratene_z_pohody_at timestamptz,
  add column if not exists oprava_zauctovania_at timestamptz,
  add column if not exists oprava_zauctovania_povodne jsonb;
alter table public.expense_documents
  add column if not exists prvy_export_at timestamptz,
  add column if not exists pocet_exportov integer not null default 0,
  add column if not exists export_cesta text,
  add column if not exists vratene_z_pohody_at timestamptz,
  add column if not exists oprava_zauctovania_at timestamptz,
  add column if not exists oprava_zauctovania_povodne jsonb;

alter table public.invoices drop constraint if exists invoices_export_cesta_check;
alter table public.invoices add constraint invoices_export_cesta_check
  check (export_cesta in ('konektor', 'subor', 'prenos', 'ine'));
alter table public.purchase_invoices drop constraint if exists purchase_invoices_export_cesta_check;
alter table public.purchase_invoices add constraint purchase_invoices_export_cesta_check
  check (export_cesta in ('konektor', 'subor', 'prenos', 'ine'));
alter table public.expense_documents drop constraint if exists expense_documents_export_cesta_check;
alter table public.expense_documents add constraint expense_documents_export_cesta_check
  check (export_cesta in ('konektor', 'subor', 'prenos', 'ine'));

comment on column public.invoices.prvy_export_at is 'Kedy doklad prvýkrát odišiel do účtovníctva (Pohoda) — po vrátení sa nemaže.';
comment on column public.invoices.pocet_exportov is 'Koľkokrát doklad odišiel do účtovníctva (vrátenie a nové odovzdanie = 2).';
comment on column public.invoices.export_cesta is 'Ako odišiel naposledy: konektor | subor (XML, balík, e-mail) | prenos (import z iného programu) | ine.';
comment on column public.invoices.vratene_z_pohody_at is 'Kedy bol vrátený z Pohody na opravu; nové odovzdanie ho vynuluje.';
comment on column public.invoices.oprava_zauctovania_at is 'Opraviť zaúčtovanie: odomknuté zaúčtovacie polia, v Pohode ich treba prepísať ručne.';
comment on column public.invoices.oprava_zauctovania_povodne is 'Zaúčtovanie, ktoré je v Pohode (pred opravou).';
