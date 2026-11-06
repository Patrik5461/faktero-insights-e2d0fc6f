-- Druh tuzemského prenesenia daňovej povinnosti na faktúre (checklist B2-7).
-- SK: písmeno § 69 ods. 12 zákona č. 222/2004 Z. z. (a–j), CZ: § 92b–§ 92f
-- zákona č. 235/2004 Sb. Na doklade sa podľa neho vytlačí celé ustanovenie
-- („§ 69 ods. 12 písm. j) zákona č. 222/2004 Z. z. o DPH – stavebné práce“).
-- NULL = všeobecná veta s § 69 ods. 12 (resp. § 92a), prípadne odhad z colných kódov.
alter table public.invoices
  add column if not exists pdp_druh text;

alter table public.invoices
  drop constraint if exists invoices_pdp_druh_check;
alter table public.invoices
  add constraint invoices_pdp_druh_check
  check (pdp_druh is null or pdp_druh in ('a','b','c','d','e','f','g','h','i','j','92b','92c','92d','92e','92f'));

comment on column public.invoices.pdp_druh is
  'Druh tuzemského PDP: SK písmeno § 69 ods. 12 (a–j), CZ 92b–92f; NULL = všeobecná veta.';
