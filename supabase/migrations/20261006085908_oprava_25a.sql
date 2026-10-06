-- Opravný doklad podľa § 25a zákona o DPH (nevymožiteľná pohľadávka).
-- Je to dobropis (type = credit_note) s väzbou na pôvodnú faktúru, ale vo
-- výkazoch ide do r. 26/27 priznania a do C.1 kontrolného výkazu s ONP = „x“.
-- Zníženie má sumy záporné, vrátenie opravy po neskoršej úhrade kladné.
alter table public.invoices
  add column if not exists oprava_25a boolean not null default false;
create index if not exists invoices_oprava_25a_idx
  on public.invoices (opravuje_fakturu_id) where oprava_25a;
