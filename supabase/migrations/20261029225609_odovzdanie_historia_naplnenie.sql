-- História odovzdania (P-1008) — 2/3: cesta odovzdania a spätné naplnenie
-- z export_logs (vystavené) a historia_dokladov (prijaté, bločky; od 8. 10. 2026).

/* ------------------------------------------------------------------ 2) cesta odovzdania */

/** Z dávky (export_jobs) — konektor má vždy `pohoda-davka.xml`, prenos formát `doklado-prenos`. */
create or replace function public.faktero_cesta_odovzdania(_job uuid)
returns text
language sql
stable
set search_path = public
as $$
  select case
           when _job is null then 'ine'
           when j.id is null then 'ine'
           when j.format = 'doklado-prenos' then 'prenos'
           when j.file_name = 'pohoda-davka.xml' then 'konektor'
           else 'subor'
         end
    from (select 1) x
    left join public.export_jobs j on j.id = _job
$$;
revoke all on function public.faktero_cesta_odovzdania(uuid) from public, anon;
grant execute on function public.faktero_cesta_odovzdania(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------ 3) spätné naplnenie */

-- Bez spúšťačov — inak by sa posunul `updated_at` a ozvali by sa pravidlá
-- účtovania; meníme len nové stĺpce.
alter table public.invoices disable trigger user;
alter table public.purchase_invoices disable trigger user;
alter table public.expense_documents disable trigger user;

-- Vystavené: história je v export_logs (ok aj returned = doklad v Pohode bol).
with l as (
  select invoice_id,
         count(*) as n,
         min(coalesce(potvrdene_at, created_at)) as prvy,
         (array_agg(export_job_id order by created_at desc))[1] as job
    from public.export_logs
   where status in ('ok', 'returned') and invoice_id is not null
   group by invoice_id
), v as (
  select doklad_id, max(kedy) as kedy
    from public.historia_dokladov
   where agenda = 'faktura' and pole = 'exported_at'
     and jsonb_typeof(pred) = 'string' and jsonb_typeof(po) = 'null'
   group by doklad_id
)
update public.invoices i
   set prvy_export_at = least(l.prvy, i.exported_at),
       pocet_exportov = l.n,
       export_cesta = public.faktero_cesta_odovzdania(l.job),
       vratene_z_pohody_at = case when i.exported_at is null then coalesce(v.kedy, l.prvy) end
  from l
  left join v on v.doklad_id = l.invoice_id
 where i.id = l.invoice_id;

-- Prijaté a bločky: história zmien (od 8. 10. 2026) + súčasné exported_at.
with h as (
  select doklad_id,
         count(*) filter (where jsonb_typeof(pred) = 'null' and jsonb_typeof(po) = 'string') as odovzdani,
         min((po #>> '{}')::timestamptz) filter (where jsonb_typeof(po) = 'string') as prvy_po,
         min((pred #>> '{}')::timestamptz) filter (where jsonb_typeof(pred) = 'string') as prvy_pred,
         max(kedy) filter (where jsonb_typeof(pred) = 'string' and jsonb_typeof(po) = 'null') as vratene,
         -- prvá udalosť je vrátenie → doklad bol odovzdaný ešte pred začiatkom histórie
         (array_agg(jsonb_typeof(pred) order by kedy))[1] = 'string' as pred_historiou
    from public.historia_dokladov
   where agenda = 'prijata' and pole = 'exported_at'
   group by doklad_id
)
update public.purchase_invoices p
   set prvy_export_at = least(h.prvy_po, h.prvy_pred, p.exported_at),
       pocet_exportov = greatest(
         coalesce(h.odovzdani, 0) + case when h.pred_historiou then 1 else 0 end,
         case when p.exported_at is not null then 1 else 0 end
       ),
       export_cesta = public.faktero_cesta_odovzdania(p.export_job_id),
       vratene_z_pohody_at = case when p.exported_at is null then h.vratene end
  from (select id from public.purchase_invoices where exported_at is not null
        union select doklad_id from h) d
  left join h on h.doklad_id = d.id
 where p.id = d.id;

with h as (
  select doklad_id,
         count(*) filter (where jsonb_typeof(pred) = 'null' and jsonb_typeof(po) = 'string') as odovzdani,
         min((po #>> '{}')::timestamptz) filter (where jsonb_typeof(po) = 'string') as prvy_po,
         min((pred #>> '{}')::timestamptz) filter (where jsonb_typeof(pred) = 'string') as prvy_pred,
         max(kedy) filter (where jsonb_typeof(pred) = 'string' and jsonb_typeof(po) = 'null') as vratene,
         (array_agg(jsonb_typeof(pred) order by kedy))[1] = 'string' as pred_historiou
    from public.historia_dokladov
   where agenda = 'doklad' and pole = 'exported_at'
   group by doklad_id
)
update public.expense_documents e
   set prvy_export_at = least(h.prvy_po, h.prvy_pred, e.exported_at),
       pocet_exportov = greatest(
         coalesce(h.odovzdani, 0) + case when h.pred_historiou then 1 else 0 end,
         case when e.exported_at is not null then 1 else 0 end
       ),
       export_cesta = public.faktero_cesta_odovzdania(e.export_job_id),
       vratene_z_pohody_at = case when e.exported_at is null then h.vratene end
  from (select id from public.expense_documents where exported_at is not null
        union select doklad_id from h) d
  left join h on h.doklad_id = d.id
 where e.id = d.id;

alter table public.invoices enable trigger user;
alter table public.purchase_invoices enable trigger user;
alter table public.expense_documents enable trigger user;
