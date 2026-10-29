-- Súčty za vyfiltrovaný zoznam vystavených faktúr (P-1007): základ, DPH a
-- celková suma po menách a sadzbách DPH. Zoznam je stránkovaný na serveri,
-- preto sa súčet nedá zložiť z načítanej stránky.
--
-- Filtre zodpovedajú zoznamu `faktury.index.tsx` (usePagedList + upravDotaz).
-- Pravidlá súčtu ako `suhrn-dph.ts`: stornovaná sa nepočíta, koncept len v
-- záložke Koncepty, zálohová a daňový doklad k platbe len vo vlastnej
-- záložke, dobropis odpočítava (otáča sa len kladne uložený).
--
-- SECURITY INVOKER — riadky filtruje RLS (firma, práva, mfa_ok) ako zoznam.
create or replace function public.suhrn_vystavenych_faktur(
  p_company_id uuid,
  p_typy text[] default null,
  p_status text default null,
  p_hladanie text default null,
  p_podla text default 'vystavenie',
  p_od date default null,
  p_do date default null,
  p_stav text default null,
  p_stitok text default null,
  p_export text default null,
  p_neuhradene boolean default false,
  p_po_splatnosti boolean default false,
  p_bez_upomienky boolean default false,
  p_ids uuid[] default null
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with hladanie as (
  select nullif(trim(regexp_replace(coalesce(p_hladanie, ''), '[%_,]', '', 'g')), '') as t
),
vybrane as (
  select i.*
  from invoices i, hladanie h
  where i.company_id = p_company_id
    and i.deleted_at is null
    and (p_ids is null or i.id = any(p_ids))
    and (p_typy is null or i.type::text = any(p_typy))
    and (p_status is null or i.status::text = p_status)
    and (
      h.t is null
      or i.invoice_number ilike '%' || h.t || '%'
      or i.customer_name ilike '%' || h.t || '%'
      or i.customer_ico ilike '%' || h.t || '%'
    )
    and (
      p_od is null
      or (case p_podla
            when 'dodanie' then coalesce(i.delivery_date, i.issue_date)
            when 'splatnost' then i.due_date
            else i.issue_date
          end) >= p_od
    )
    and (
      p_do is null
      or (case p_podla
            when 'dodanie' then coalesce(i.delivery_date, i.issue_date)
            when 'splatnost' then i.due_date
            else i.issue_date
          end) <= p_do
    )
    and (
      p_stav is null or p_stav = ''
      or (p_stav = '_bez' and i.stav_id is null)
      or (p_stav <> '_bez' and i.stav_id::text = p_stav)
    )
    and (p_stitok is null or p_stitok = '' or p_stitok = any(i.stitky))
    and (
      p_export is null or p_export = ''
      or (p_export = 'ano' and i.exported_at is not null)
      or (p_export = 'nie' and i.exported_at is null and i.status::text not in ('draft', 'cancelled'))
    )
    -- Neuhradená = jeOtvorena (faktury-sumy.ts).
    and (
      not p_neuhradene
      or (
        i.status::text not in ('draft', 'cancelled', 'paid')
        and i.type::text not in ('proforma', 'advance_payment', 'credit_note')
        and i.paid_at is null
      )
    )
    -- Po splatnosti sa počíta z dátumu, stav `overdue` nikto nezapisuje.
    and (
      not (p_po_splatnosti or p_bez_upomienky)
      or (
        i.status::text in ('issued', 'sent')
        and i.due_date < current_date
        and i.paid_at is null
      )
    )
    and (
      not p_bez_upomienky
      or not exists (
        select 1 from invoice_reminders r where r.invoice_id = i.id and r.status = 'sent'
      )
    )
),
zapocitane as (
  select
    v.id,
    upper(coalesce(nullif(v.currency, ''), 'EUR')) as mena,
    case when v.type::text = 'credit_note' and v.total > 0 then -1 else 1 end as zn,
    coalesce(v.subtotal, 0) as zaklad,
    coalesce(v.vat_total, 0) as dph,
    coalesce(v.total, 0) as celkom,
    coalesce(v.reverse_charge, false) as pdp
  from vybrane v
  where v.status::text <> 'cancelled'
    and (v.status::text <> 'draft' or p_status = 'draft')
    and (v.type::text not in ('proforma', 'advance_payment') or p_typy = array[v.type::text])
),
polozky as (
  select
    z.id,
    case when z.pdp then null else it.vat_rate end as sadzba,
    sum(coalesce(it.subtotal, 0)) as zaklad,
    sum(coalesce(it.vat_amount, 0)) as dph
  from zapocitane z
  join invoice_items it on it.invoice_id = z.id
  group by 1, 2
),
polozky_spolu as (
  select id, sum(zaklad) as zaklad, sum(dph) as dph from polozky group by id
),
-- Rozpis po sadzbách z položiek, dorovnaný na hlavičku dokladu (zľava na
-- doklad je len v hlavičke, riadky ju nemajú).
casti as (
  select
    z.mena,
    p.sadzba,
    z.pdp,
    z.zn * case when s.zaklad <> 0 then p.zaklad * z.zaklad / s.zaklad else p.zaklad end as zaklad,
    z.zn * case when s.dph <> 0 then p.dph * z.dph / s.dph else p.dph end as dph
  from zapocitane z
  join polozky p on p.id = z.id
  join polozky_spolu s on s.id = z.id
  union all
  -- Doklad bez položiek ide celý do riadku bez sadzby.
  select z.mena, null, z.pdp, z.zn * z.zaklad, z.zn * z.dph
  from zapocitane z
  where not exists (select 1 from polozky p where p.id = z.id)
),
sadzby as (
  select
    mena,
    jsonb_agg(
      jsonb_build_object(
        'sadzba', sadzba,
        'pdp', pdp,
        'zaklad', round(zaklad, 2),
        'dph', round(dph, 2),
        'celkom', round(zaklad + dph, 2)
      )
      order by pdp, sadzba desc nulls last
    ) as sadzby
  from (
    select mena, sadzba, pdp and sadzba is null as pdp, sum(zaklad) as zaklad, sum(dph) as dph
    from casti
    group by mena, sadzba, pdp and sadzba is null
  ) g
  group by mena
),
meny as (
  select
    mena,
    count(*) as pocet,
    round(sum(zn * zaklad), 2) as zaklad,
    round(sum(zn * dph), 2) as dph,
    round(sum(zn * celkom), 2) as celkom,
    min(case when mena = 'EUR' then 0 else 1 end) as poradie
  from zapocitane
  group by mena
)
select jsonb_build_object(
  'pocet', (select count(*) from vybrane),
  'mimo', (select count(*) from vybrane) - (select count(*) from zapocitane),
  'meny', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'mena', m.mena,
          'pocet', m.pocet,
          'zaklad', m.zaklad,
          'dph', m.dph,
          'celkom', m.celkom,
          'sadzby', coalesce(s.sadzby, '[]'::jsonb)
        )
        order by m.poradie, m.pocet desc, m.mena
      )
      from meny m
      left join sadzby s on s.mena = m.mena
    ),
    '[]'::jsonb
  )
);
$$;

revoke execute on function public.suhrn_vystavenych_faktur(uuid, text[], text, text, text, date, date, text, text, text, boolean, boolean, boolean, uuid[]) from public;
revoke execute on function public.suhrn_vystavenych_faktur(uuid, text[], text, text, text, date, date, text, text, text, boolean, boolean, boolean, uuid[]) from anon;
grant execute on function public.suhrn_vystavenych_faktur(uuid, text[], text, text, text, date, date, text, text, text, boolean, boolean, boolean, uuid[]) to authenticated, service_role;
