-- Opravy B4 (1. 11. 2026): prehlad_suhrn
-- S-01  otvorené pohľadávky bez 13-mesačného okna (obrat, DPH a tržby ostávajú na oknách)
-- S-02  cudzia mena: *_eur → kurz dokladu (ECB delí, ČNB násobí) → inak mimo súčtu,
--       počet a sumy po menách v `bez_prepoctu`; `prepocitane` = niečo sa prepočítalo.
--       Uložený kurz 1 pri cudzej mene je predvolená hodnota starých importov, nie kurz.
-- S-03  `dlznikov_po_splatnosti` (karta Po splatnosti)
-- S-09  priemerná doba úhrady bez záloh, daňových dokladov k platbe a dobropisov
-- S-10  DPH na odvod podľa dátumu dodania (ako výkazy)
-- S-11  bločky (expense_documents) vo výdavkoch roka a v odpočte DPH
-- Spätne kompatibilné: rovnaké parametre, staré kľúče ostávajú, len pribudli nové.

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
-- Vystavené doklady za 13 mesiacov + všetky ešte neuhradené (S-01), sumy v domácej mene.
inv0 as (
  select
    i.id,
    i.type::text as typ,
    i.status::text as stav,
    i.customer_id,
    i.customer_name,
    i.issue_date,
    coalesce(i.delivery_date, i.issue_date) as dodanie,
    i.due_date,
    i.paid_at,
    upper(coalesce(nullif(trim(i.currency), ''), p_mena)) as mena,
    i.total, i.subtotal, i.vat_total, i.total_eur, i.subtotal_eur, i.vat_total_eur,
    case when i.exchange_rate > 0 and i.exchange_rate <> 1 then i.exchange_rate end as kurz
  from invoices i
  cross join hranice h
  where i.company_id = p_company_id
    and i.deleted_at is null
    and (
      i.issue_date >= h.fak_od
      or (i.paid_at is null and i.status::text not in ('paid', 'cancelled', 'draft'))
    )
),
inv as (
  select
    inv0.id, typ, stav, customer_id, customer_name, issue_date, dodanie, due_date, paid_at, mena,
    (mena <> p_mena) as cudzia,
    case
      when mena = p_mena then total
      when total_eur is not null then total_eur
      when kurz is not null then round(case when p_mena = 'CZK' then total * kurz else total / kurz end, 2)
    end as celkom,
    case
      when mena = p_mena then subtotal
      when subtotal_eur is not null then subtotal_eur
      when total_eur is not null and coalesce(total, 0) <> 0 then round(total_eur * subtotal / total, 2)
      when kurz is not null then round(case when p_mena = 'CZK' then subtotal * kurz else subtotal / kurz end, 2)
    end as zaklad,
    case
      when mena = p_mena then vat_total
      when vat_total_eur is not null then vat_total_eur
      when total_eur is not null and coalesce(total, 0) <> 0 then round(total_eur * vat_total / total, 2)
      when kurz is not null then round(case when p_mena = 'CZK' then vat_total * kurz else vat_total / kurz end, 2)
    end as dph,
    total as celkom_povodne
  from inv0
),
f as (
  select
    inv.*,
    -- jeZapocitatelny: koncept, storno, zálohová a daňový doklad k platbe nie.
    (stav not in ('draft', 'cancelled') and typ not in ('proforma', 'advance_payment')) as zap,
    -- znamienkoDokladu: otáča sa len kladne (alebo nulou) uložený dobropis.
    case when typ = 'credit_note' and not (coalesce(celkom_povodne, 0) < 0) then -1 else 1 end as zn,
    (celkom is null) as bez_kurzu
  from inv
),
g as (
  select
    f.*,
    (zap and typ <> 'credit_note' and paid_at is null and stav <> 'paid') as otv0
  from f
),
fakt as (
  select
    g.*,
    -- `otv` sú otvorené pohľadávky, ktoré sa dajú vyjadriť v domácej mene.
    (otv0 and not bez_kurzu) as otv,
    (otv0 and not bez_kurzu and due_date is not null and due_date < p_dnes) as po_spl,
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
-- Len stĺpce, ktoré súčty potrebujú (výkon, pozri vykon_db_prehlad_suhrn_stlpce).
pi as (
  select
    p.id, p.type, p.status, p.due_date, p.issue_date, p.delivery_date,
    upper(coalesce(nullif(trim(p.currency), ''), p_mena)) as mena,
    p.amount_total, p.amount_without_vat, p.amount_without_vat_eur,
    p.vat_amount, p.vat_amount_eur, p.odpocet, p.advance_invoice_id,
    case when p.exchange_rate > 0 and p.exchange_rate <> 1 then p.exchange_rate end as kurz
  from purchase_invoices p
  where p.company_id = p_company_id
    and p.deleted_at is null
),
pd0 as (
  select
    pi.*,
    case
      when mena = p_mena then amount_total
      when amount_without_vat_eur is not null then amount_without_vat_eur + coalesce(vat_amount_eur, 0)
      when kurz is not null then round(case when p_mena = 'CZK' then amount_total * kurz else amount_total / kurz end, 2)
    end as celkom_d,
    case
      when mena = p_mena then amount_without_vat
      when amount_without_vat_eur is not null then amount_without_vat_eur
      when kurz is not null then round(case when p_mena = 'CZK' then amount_without_vat * kurz else amount_without_vat / kurz end, 2)
    end as zaklad_d,
    case
      when mena = p_mena then vat_amount
      when amount_without_vat_eur is not null then coalesce(vat_amount_eur, 0)
      when kurz is not null then round(case when p_mena = 'CZK' then vat_amount * kurz else vat_amount / kurz end, 2)
    end as dph_d,
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
pd as (
  select pd0.*, (celkom_d is null) as bez_kurzu from pd0
),
-- Bločky tohto roka (S-11) — vždy zaplatené na mieste, idú do výdavkov aj odpočtu.
bl as (
  select
    upper(coalesce(nullif(trim(e.currency), ''), p_mena)) as mena,
    e.odpocet,
    coalesce(e.net_amount, e.total_amount - coalesce(e.vat_amount, 0)) as zaklad,
    e.vat_amount as dph,
    case when e.exchange_rate > 0 and e.exchange_rate <> 1 then e.exchange_rate end as kurz
  from expense_documents e, hranice h
  where e.company_id = p_company_id
    and e.issue_date >= h.rok_od
),
bld as (
  select
    mena,
    odpocet,
    case
      when mena = p_mena then zaklad
      when kurz is not null then round(case when p_mena = 'CZK' then zaklad * kurz else zaklad / kurz end, 2)
    end as zaklad_d,
    case
      when mena = p_mena then dph
      when kurz is not null then round(case when p_mena = 'CZK' then dph * kurz else dph / kurz end, 2)
    end as dph_d,
    zaklad as zaklad_povodny
  from bl
),
tyzdne as (
  select w from generate_series(0, 3) as w
),
-- Neuhradené doklady v cudzej mene bez kurzu: po menách, v pôvodnej mene.
bez_fakt as (
  select mena, count(*) as n, round(sum(coalesce(celkom_povodne, 0)), 2) as s
  from fakt where otv0 and bez_kurzu group by mena
),
bez_prij as (
  select mena, count(*) as n, round(sum(coalesce(amount_total, 0)), 2) as s
  from pd where bez_kurzu and status not in ('paid', 'cancelled', 'draft') group by mena
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
  'dlznikov_po_splatnosti', (select count(distinct coalesce(customer_id::text, nullif(customer_name, ''))) filter (where po_spl) from fakt),
  'priemer_dni_uhrady', (
    select avg(extract(epoch from (paid_at - (issue_date::timestamp at time zone 'UTC'))) / 86400)
    from fakt
    where stav = 'paid' and paid_at is not null and issue_date is not null
      and zap and typ <> 'credit_note'
  ),
  'dph_odvod', (select coalesce(round(sum(zn * coalesce(dph, 0)) filter (where zap and dodanie >= h.rok_od), 2), 0) from fakt, hranice h),
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
      select kos, count(*) as n, sum(celkom_d) as s
      from pd where status in ('received', 'booked') and due_date is not null and not bez_kurzu group by kos
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
        select sum(celkom_d) from pd
        where status in ('received', 'booked') and not bez_kurzu
          and due_date - p_dnes >= 7 * t.w and due_date - p_dnes < 7 * (t.w + 1)
      ), 0)
    ) order by t.w)
    from tyzdne t
  ),
  'zaplatene_30', coalesce((
    select sum(coalesce(amount, 0)) from payments
    where company_id = p_company_id
      and (paid_at::timestamp at time zone 'UTC') >= now() - interval '30 days'
  ), 0),
  'zavazky_neuhradene', (select coalesce(round(sum(celkom_d) filter (where status not in ('paid', 'cancelled', 'draft') and not bez_kurzu), 2), 0) from pd),
  'zavazky_po_splatnosti', (select count(*) filter (where status not in ('paid', 'cancelled', 'draft') and due_date < p_dnes) from pd),
  'zavazky_pocet', (select count(*) from pd),
  -- Odpočet a výdavky tohto roka: záloha nie je náklad, bez nároku na odpočet do odpočtu nejde.
  -- Prijaté faktúry podľa dodania, bločky podľa vystavenia.
  'dph_odpocet', (
    select coalesce(round(
      coalesce((
        select sum(dph_d) filter (where odpocet is distinct from false)
        from pd, hranice h
        where type <> 'proforma' and status <> 'cancelled' and coalesce(delivery_date, issue_date) >= h.rok_od
      ), 0)
      + coalesce((select sum(dph_d) filter (where odpocet is distinct from false) from bld), 0)
    , 2), 0)
  ),
  'vydavky_rok', (
    select coalesce(round(
      coalesce((
        select sum(zaklad_d)
        from pd, hranice h
        where type <> 'proforma' and status <> 'cancelled' and coalesce(delivery_date, issue_date) >= h.rok_od
      ), 0)
      + coalesce((select sum(zaklad_d) from bld), 0)
    , 2), 0)
  ),
  'vydavky_blocky_rok', (select coalesce(round(sum(zaklad_d), 2), 0) from bld),
  -- Prepočítané kurzom (aspoň jeden doklad v cudzej mene je v súčtoch) → značka „prepočítané“.
  'prepocitane', (
    coalesce((select bool_or(cudzia and not bez_kurzu) from fakt), false)
    or coalesce((select bool_or(mena <> p_mena and not bez_kurzu) from pd), false)
    or coalesce((select bool_or(mena <> p_mena and zaklad_d is not null) from bld), false)
  ),
  -- Doklady v cudzej mene bez kurzu: v súčtoch nie sú (S-02).
  'bez_prepoctu', jsonb_build_object(
    'faktury', (select count(*) from fakt where bez_kurzu and (zap or otv0)),
    'prijate', (select count(*) from pd where bez_kurzu and type <> 'proforma' and status not in ('cancelled', 'draft')),
    'blocky', (select count(*) from bld where zaklad_d is null),
    'pohladavky', coalesce((select jsonb_object_agg(mena, s) from bez_fakt), '{}'::jsonb),
    'zavazky', coalesce((select jsonb_object_agg(mena, s) from bez_prij), '{}'::jsonb)
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
