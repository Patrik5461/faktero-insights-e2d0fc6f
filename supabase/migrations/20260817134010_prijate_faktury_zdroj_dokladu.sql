-- Odkiaľ doklad prišiel. Doteraz sa to nedalo rozlíšiť: `created_by` má aj
-- doklad z mailu (nastaví sa naň majiteľ adresy), takže „kto to zapísal" bez
-- tohto stĺpca klamalo.
alter table public.purchase_invoices
  add column if not exists source text not null default 'rucne';

alter table public.purchase_invoices
  drop constraint if exists purchase_invoices_source_check;
alter table public.purchase_invoices
  add constraint purchase_invoices_source_check
  check (source in ('rucne', 'mail', 'doklad'));

-- Doklady, ktoré vznikli z prijatej pošty, sa dajú spätne rozoznať podľa denníka.
update public.purchase_invoices pi
set source = 'mail'
from public.inbox_messages im
where pi.id = any (im.created_invoice_ids)
  and pi.source <> 'mail';

comment on column public.purchase_invoices.source is
  'rucne = zapísal človek, mail = prišlo na adresu na doklady, doklad = presunuté z agendy Doklady';
