-- OPRAVA DÁT — NESPÚŠŤA SA SAMA. Spustiť až po schválení.
--
-- Import z Pohody 10. 8. 2026 zmenil nulovú sadzbu DPH na 23 % (`sadzba || 23`
-- v importéri, opravené v kóde 2. 10.). Originálne súbory z Pohody, ktoré
-- ležia v koši `imports`, majú pri všetkých 56 faktúrach nižšie DPH nulovú:
-- PALIERA predáva ojazdené autá v osobitnej úprave, Tobify nie je platiteľ.
--
-- Výkaz k DPH sa počíta z položiek, takže bez opravy by PALIERA za máj 2025
-- priznala 14 820,51 € a Tobify by mala 4 520,94 € daně, ktorú nikdy nefakturovala.
--
-- Mimo opravy ostávajú PALIERA 23800027 a 25800003 — v origináli majú daň na
-- položkách, hoci súhrn hovorí nulu. Tie treba pozrieť ručne.

begin;

-- 1) Záloha pôvodných hodnôt — oprava sa dá vrátiť.
create table if not exists public.zaloha_oprava_dph_20261002 as
select 'invoice'::text as tabulka, i.id, i.company_id, i.invoice_number,
       i.vat_total as vat_total_pred, null::numeric as vat_rate_pred,
       null::numeric as vat_amount_pred, null::numeric as total_pred
  from public.invoices i where false;

with ciel as (
  select i.id from public.invoices i
  join public.companies c on c.id = i.company_id
  where i.import_source = 'Pohoda' and i.deleted_at is null
    and (
      (c.name = 'PALIERA s.r.o.' and i.invoice_number in (
        '23800022','23800023','23800024','23800025','23800026','23800029',
        '24800016','25800004','25800005','25800006','25800010','25800011'))
      or
      (c.name = 'Tobify s. r. o.' and i.invoice_number in (
        '0022026','2026001','2026002','2026003','2026004','2026005','2026006','2026007',
        '2026008','2026009','2026010','2026011','2026012','2026013','2026014','2026015',
        '2026016','2026017','2026018','2026019','2026020','2026021','2026022','2026023',
        '2026024','2026025','2026026','2026027','2026028','2026029','2026030','2026031',
        '2026032','2026033','2026034','2026035','2026036','2026037','2026038','2026039',
        'ZAL12026001','ZAL12026002','ZAL12026003','ZAL12026004'))
    )
)
insert into public.zaloha_oprava_dph_20261002
select 'invoice', i.id, i.company_id, i.invoice_number, i.vat_total, null, null, i.total
  from public.invoices i where i.id in (select id from ciel)
union all
select 'item', x.id, i.company_id, i.invoice_number, null, x.vat_rate, x.vat_amount, x.total
  from public.invoice_items x join public.invoices i on i.id = x.invoice_id
 where i.id in (select id from ciel);

-- Kontrola: musí byť presne 56 faktúr.
do $$
begin
  if (select count(*) from public.zaloha_oprava_dph_20261002 where tabulka = 'invoice') <> 56 then
    raise exception 'Čakal som 56 faktúr — niečo nesedí, nič sa nemení.';
  end if;
end $$;

-- 2) Položky: nulová sadzba, nulová daň, spolu = základ.
update public.invoice_items x
   set vat_rate = 0, vat_amount = 0, total = x.subtotal
 where x.id in (select id from public.zaloha_oprava_dph_20261002 where tabulka = 'item');

-- 3) Hlavička: nulová DPH. `total` sa nemení — v origináli aj teraz = základ.
update public.invoices i
   set vat_total = 0
 where i.id in (select id from public.zaloha_oprava_dph_20261002 where tabulka = 'invoice');

-- Kontrola po oprave: základ + DPH = spolu na všetkých 56.
do $$
begin
  if exists (
    select 1 from public.invoices i
     where i.id in (select id from public.zaloha_oprava_dph_20261002 where tabulka = 'invoice')
       and abs(i.subtotal + i.vat_total - i.total) > 0.01
  ) then
    raise exception 'Po oprave stále nesedí základ + DPH = spolu — vraciam.';
  end if;
end $$;

commit;

-- VRÁTENIE (len ak treba):
-- update public.invoice_items x set vat_rate = z.vat_rate_pred, vat_amount = z.vat_amount_pred, total = z.total_pred
--   from public.zaloha_oprava_dph_20261002 z where z.tabulka = 'item' and z.id = x.id;
-- update public.invoices i set vat_total = z.vat_total_pred
--   from public.zaloha_oprava_dph_20261002 z where z.tabulka = 'invoice' and z.id = i.id;
