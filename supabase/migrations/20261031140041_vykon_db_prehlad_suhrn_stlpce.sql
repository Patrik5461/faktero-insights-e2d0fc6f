-- Výkon databázy (vlna 31. 10. 2026): prehlad_suhrn — CTE prijatých faktúr
-- berie len potrebné stĺpce namiesto p.*. PALIERA (1 256 prijatých): 47 → 39 ms
-- s RLS; výsledok rovnaký ako predtým.

create or replace function public.prehlad_suhrn(
  p_company_id uuid,
  p_dnes date,
  p_mena text default 'EUR',
  p_dnes_od timestamptz default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
hranice as (
  select
    date_trunc('month', p_dnes)::date as mes_od,
    (date_trunc('month', p_dnes) - interval '1 month')::date as min_od,
    date_trunc('year', p_dnes)::date as rok_od,
    (p_dnes - interval '13 months')::date as fak_od
),
-- Vystavené doklady za 13 mesiacov, sumy v domácej mene.
inv as (
  select
    i.id,
    i.type::text as typ,
    i.status::text as stav,
    i.customer_id,
    i.customer_name,
    i.issue_date,
    i.due_date,
    i.paid_at,
    case when cudzia then i.total_eur else i.total end as celkom,
    case when cudzia then coalesce(i.subtotal_eur, i.subtotal) else i.subtotal end as zaklad,
    case when cudzia then coalesce(i.vat_total_eur, i.vat_total) else i.vat_total end as dph
  from invoices i
  cross join hranice h
  cross join lateral (
    select coalesce(nullif(i.currency, ''), p_mena) <> p_mena and i.total_eur is not null as cudzia
  ) c
  where i.company_id = p_company_id
    and i.deleted_at is null
    and i.issue_date >= h.fak_od
),
f as (
  select
    inv.*,
    -- jeZapocitatelny: koncept, storno, zálohová a daňový doklad k platbe nie.
    (stav not in ('draft', 'cancelled') and typ not in ('proforma', 'advance_payment')) as zap,
    -- znamienkoDokladu: otáča sa len kladne (alebo nulou) uložený dobropis.
    case when typ = 'credit_note' and not (coalesce(celkom, 0) < 0) then -1 else 1 end as zn
  from inv
),
g as (
  select
    f.*,
    (zap and typ <> 'credit_note' and paid_at is null and stav <> 'paid') as otv
  from f
),
fakt as (
  select
    g.*,
    (otv and due_date is not null and due_date < p_dnes) as po_spl,
    case
      when p_dnes - due_date <= 0 then 0
      when p_dnes - due_date <= 30 then 1
      when p_dnes - due_date <= 60 then 2
      when p_dnes - due_date <= 90 then 3
      else 4
    end as kos
  from g
),
-- Prijaté faktúry. Zálohu, ktorú už zúčtovala ostrá faktúra, netreba platiť.
-- Len stĺpce, ktoré súčty potrebujú: `p.*` (≈ 3 kB na riadok) materializované
-- v CTE stálo pri 1 200 prijatých faktúrach dvojnásobok času.
pi as (
  select
    p.id, p.type, p.status, p.currency, p.due_date, p.issue_date, p.delivery_date,
    p.amount_total, p.amount_without_vat, p.amount_without_vat_eur,
    p.vat_amount, p.vat_amount_eur, p.odpocet, p.advance_invoice_id
  from purchase_invoices p
  where p.company_id = p_company_id
    and p.deleted_at is null
),
pd as (
  select
    pi.*,
    case
      when coalesce(nullif(pi.currency, ''), p_mena) <> p_mena and pi.amount_without_vat_eur is not null
        then pi.amount_without_vat_eur + coalesce(pi.vat_amount_eur, 0)
      else pi.amount_total
    end as celkom_d,
    case
      when p_dnes - pi.due_date <= 0 then 0
      when p_dnes - pi.due_date <= 30 then 1
      when p_dnes - pi.due_date <= 60 then 2
      when p_dnes - pi.due_date <= 90 then 3
      else 4
    end as kos
  from pi
  where not (
    pi.type = 'proforma'
    and pi.id in (select x.advance_invoice_id from pi x where x.advance_invoice_id is not null)
  )
),
tyzdne as (
  select w from generate_series(0, 3) as w
)
select jsonb_build_object(
  'pocet_faktur', (select count(*) from fakt),
  'ma_zaplatenu', coalesce((select bool_or(stav = 'paid') from fakt), false),
  'mesiac_obrat', (select coalesce(round(sum(zn * coalesce(celkom, 0)) filter (where zap and issue_date >= h.mes_od), 2), 0) from fakt, hranice h),
  'minuly_obrat', (select coalesce(round(sum(zn * coalesce(celkom, 0)) filter (where zap and issue_date >= h.min_od and issue_date < h.mes_od), 2), 0) from fakt, hranice h),
  'neuhradene_suma', (select coalesce(round(sum(zn * coalesce(celkom, 0)) filter (where otv), 2), 0) from fakt),
  'neuhradene_pocet', (select count(*) filter (where otv) from fakt),
  'po_splatnosti_suma', (select coalesce(round(sum(zn * coalesce(celkom, 0)) filter (where po_spl), 2), 0) from fakt),
  'po_splatnosti_pocet', (select count(*) filter (where po_spl) from fakt),
  'dlznikov', (select count(distinct coalesce(customer_id::text, nullif(customer_name, ''))) filter (where otv) from fakt),
  'priemer_dni_uhrady', (
    select avg(extract(epoch from (paid_at - (issue_date::timestamp at time zone 'UTC'))) / 86400)
    from fakt
    where stav = 'paid' and paid_at is not null and issue_date is not null
  ),
  'dph_odvod', (select coalesce(round(sum(zn * coalesce(dph, 0)) filter (where zap and issue_date >= h.rok_od), 2), 0) from fakt, hranice h),
  'prijmy_rok', (select coalesce(round(sum(zn * coalesce(zaklad, 0)) filter (where zap and issue_date >= h.rok_od), 2), 0) from fakt, hranice h),
  'trzby_365', (select coalesce(round(sum(zn * coalesce(celkom, 0)) filter (where zap and issue_date >= p_dnes - 365), 2), 0) from fakt),
  -- Stav `overdue` nikto nezapisuje, po splatnosti sa počíta z dátumu.
  'stavy', coalesce((
    select jsonb_object_agg(kluc, n)
    from (select case when po_spl then 'overdue' else stav end as kluc, count(*) as n from fakt group by 1) s
  ), '{}'::jsonb),
  'dlznici', coalesce((
    select jsonb_agg(jsonb_build_object('meno', meno, 'suma', suma) order by suma desc)
    from (
      select coalesce(customer_name, '') as meno, sum(coalesce(celkom, 0)) as suma
      from fakt where otv group by 1 order by 2 desc limit 4
    ) d
  ), '[]'::jsonb),
  'vek_pohladavok', (
    select jsonb_agg(jsonb_build_object('pocet', coalesce(x.n, 0), 'suma', coalesce(x.s, 0)) order by k.k)
    from generate_series(0, 4) as k(k)
    left join (
      select kos, count(*) as n, sum(coalesce(celkom, 0)) as s
      from fakt where otv and due_date is not null group by kos
    ) x on x.kos = k.k
  ),
  'vek_zavazkov', (
    select jsonb_agg(jsonb_build_object('pocet', coalesce(x.n, 0), 'suma', coalesce(x.s, 0)) order by k.k)
    from generate_series(0, 4) as k(k)
    left join (
      select kos, count(*) as n, sum(coalesce(celkom_d, 0)) as s
      from pd where status in ('received', 'booked') and due_date is not null group by kos
    ) x on x.kos = k.k
  ),
  -- Výhľad na 4 týždne: splatné neuhradené vystavené proti prijatým.
  'vyhlad', (
    select jsonb_agg(jsonb_build_object(
      'prijem', coalesce((
        select sum(coalesce(celkom, 0)) from fakt
        where otv and due_date - p_dnes >= 7 * t.w and due_date - p_dnes < 7 * (t.w + 1)
      ), 0),
      'vydaj', coalesce((
        select sum(coalesce(celkom_d, 0)) from pd
        where status in ('received', 'booked') and due_date - p_dnes >= 7 * t.w and due_date - p_dnes < 7 * (t.w + 1)
      ), 0)
    ) order by t.w)
    from tyzdne t
  ),
  'zaplatene_30', coalesce((
    select sum(coalesce(amount, 0)) from payments
    where company_id = p_company_id
      and (paid_at::timestamp at time zone 'UTC') >= now() - interval '30 days'
  ), 0),
  'zavazky_neuhradene', (select coalesce(round(sum(coalesce(celkom_d, 0)) filter (where status not in ('paid', 'cancelled', 'draft')), 2), 0) from pd),
  'zavazky_po_splatnosti', (select count(*) filter (where status not in ('paid', 'cancelled', 'draft') and due_date < p_dnes) from pd),
  'zavazky_pocet', (select count(*) from pd),
  -- Odpočet a výdavky tohto roka: záloha nie je náklad, bez nároku na odpočet do odpočtu nejde.
  'dph_odpocet', (
    select coalesce(round(sum(coalesce(vat_amount_eur, vat_amount, 0)) filter (where odpocet is distinct from false), 2), 0)
    from pd, hranice h
    where type <> 'proforma' and status <> 'cancelled' and coalesce(delivery_date, issue_date) >= h.rok_od
  ),
  'vydavky_rok', (
    select coalesce(round(sum(coalesce(amount_without_vat_eur, amount_without_vat, 0)), 2), 0)
    from pd, hranice h
    where type <> 'proforma' and status <> 'cancelled' and coalesce(delivery_date, issue_date) >= h.rok_od
  ),
  'sklad_pod_minimom', (
    select count(*)
    from stock_items s
    where s.company_id = p_company_id
      and s.track_stock
      and coalesce((
        select sum(l.quantity) from stock_levels l
        where l.stock_item_id = s.id and l.company_id = p_company_id
      ), 0) < coalesce(s.min_stock, 0)
  ),
  'km_mesiac', coalesce((
    select sum(coalesce(distance_km, 0)) from trips, hranice h
    where company_id = p_company_id and trip_date >= h.mes_od
  ), 0),
  'api_dnes', (
    select count(*) from api_logs
    where company_id = p_company_id and created_at >= coalesce(p_dnes_od, p_dnes::timestamptz)
  ),
  'api_mesiac', (
    select count(*) from api_logs
    where company_id = p_company_id and created_at >= now() - interval '31 days'
  ),
  'api_uspesne', (
    select count(*) from api_logs
    where company_id = p_company_id and created_at >= now() - interval '31 days'
      and status >= 200 and status < 400
  )
);
$$;

revoke all on function public.prehlad_suhrn(uuid, date, text, timestamptz) from public, anon;
grant execute on function public.prehlad_suhrn(uuid, date, text, timestamptz) to authenticated, service_role;
