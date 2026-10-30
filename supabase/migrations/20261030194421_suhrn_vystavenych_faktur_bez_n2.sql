-- Súhrn vystavených faktúr bez vnoreného cyklu n² (3 000 faktúr: 13 s → 0,4 s).
CREATE OR REPLACE FUNCTION public.suhrn_vystavenych_faktur(p_company_id uuid, p_typy text[] DEFAULT NULL::text[], p_status text DEFAULT NULL::text, p_hladanie text DEFAULT NULL::text, p_podla text DEFAULT 'vystavenie'::text, p_od date DEFAULT NULL::date, p_do date DEFAULT NULL::date, p_stav text DEFAULT NULL::text, p_stitok text DEFAULT NULL::text, p_export text DEFAULT NULL::text, p_neuhradene boolean DEFAULT false, p_po_splatnosti boolean DEFAULT false, p_bez_upomienky boolean DEFAULT false, p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    -- Po splatnosti sa počíta z dátumu (dnešok podľa Bratislavy), stav `overdue` nikto nezapisuje.
    and (
      not (p_po_splatnosti or p_bez_upomienky)
      or (
        i.status::text in ('issued', 'sent')
        and i.due_date < (now() at time zone 'Europe/Bratislava')::date
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
/*
  Položky sa pripájajú raz (left join cez index) a súčet dokladu sa berie
  oknom. Predtým sa CTE `polozky` spájala samu so sebou a so `zapocitane`;
  s odhadom riadkov pod RLS (4 namiesto tisícov) z toho bol vnorený cyklus
  n² — pri 3 000 faktúrach 13 s a PostgREST to po 8 s zrušil (500).
*/
polozky as (
  select
    z.id,
    z.mena,
    z.zn,
    z.pdp,
    z.zaklad as hlavicka_zaklad,
    z.dph as hlavicka_dph,
    case when z.pdp then null else it.vat_rate end as sadzba,
    sum(coalesce(it.subtotal, 0)) as zaklad,
    sum(coalesce(it.vat_amount, 0)) as dph,
    bool_or(it.id is not null) as ma_polozky
  from zapocitane z
  left join invoice_items it on it.invoice_id = z.id
  group by z.id, z.mena, z.zn, z.pdp, z.zaklad, z.dph, case when z.pdp then null else it.vat_rate end
),
-- Rozpis po sadzbách z položiek, dorovnaný na hlavičku dokladu (zľava na
-- doklad je len v hlavičke, riadky ju nemajú). Doklad bez položiek ide celý
-- do riadku bez sadzby.
casti as (
  select
    mena,
    sadzba,
    pdp,
    zn * case
      when not ma_polozky then hlavicka_zaklad
      when sum(zaklad) over doklad <> 0 then zaklad * hlavicka_zaklad / sum(zaklad) over doklad
      else zaklad
    end as zaklad,
    zn * case
      when not ma_polozky then hlavicka_dph
      when sum(dph) over doklad <> 0 then dph * hlavicka_dph / sum(dph) over doklad
      else dph
    end as dph
  from polozky
  window doklad as (partition by id)
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
$function$;
