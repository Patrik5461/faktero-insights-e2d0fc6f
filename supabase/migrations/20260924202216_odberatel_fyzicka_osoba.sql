-- Odberateľ môže byť aj fyzická osoba bez IČO.
--
-- Karta odberateľa bola celá postavená na firme: povinný „názov firmy",
-- vyhľadávanie v obchodnom registri a polia IČO, DIČ a IČ DPH. Predaj
-- nepodnikateľovi sa tým dal zapísať len tak, že sa jeho meno napísalo do
-- kolónky pre firmu a zvyšok ostal prázdny — a nikde nebolo vidieť, že ide
-- o súkromnú osobu, hoci to rozhoduje napríklad pri predaji do EÚ (OSS).
alter table public.customers
  add column if not exists typ text not null default 'firma';

alter table public.customers drop constraint if exists customers_typ_chk;
alter table public.customers add constraint customers_typ_chk
  check (typ in ('firma', 'fyzicka'));

-- Doterajší odberatelia bez IČO a bez daňových čísel sú takmer isto fyzické
-- osoby; ostatní ostávajú firmami.
update public.customers
set typ = 'fyzicka'
where coalesce(btrim(ico), '') = ''
  and coalesce(btrim(dic), '') = ''
  and coalesce(btrim(ic_dph), '') = '';
