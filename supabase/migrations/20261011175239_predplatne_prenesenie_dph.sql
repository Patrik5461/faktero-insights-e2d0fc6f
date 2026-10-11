-- Predplatné pre platiteľa DPH z iného štátu EÚ (napr. česká s.r.o. s IČ DPH CZ…):
-- služba B2B má miesto plnenia u odberateľa (§ 15 ods. 1 zákona 222/2004),
-- Tobify fakturuje bez DPH s prenesením daňovej povinnosti. Rozhodnutie sa
-- uloží pri platbe (po overení VIES) a doklad ho len prevezme.
alter table public.billing_payments add column if not exists prenesenie_dph boolean not null default false;
alter table public.platform_invoices add column if not exists prenesenie_dph boolean not null default false;
