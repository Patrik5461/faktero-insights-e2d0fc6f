-- Prijatá faktúra celá zaplatená zálohou je uhradená (dátum = úhrada zálohy) a zmena
-- stavu zálohovej faktúry prepočíta faktúry, ktoré ju zúčtovávajú.
create or replace function public.prepocitaj_uhrady_prijatej(_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _f record;
  _s numeric;
  _posledna date;
  _treba numeric;
begin
  select id, status, zauctovane_at, payment_date, amount_total, advance_invoice_id into _f
    from public.purchase_invoices where id = _id;
  if not found or _f.status in ('draft', 'cancelled') then return; end if;
  select coalesce(sum(amount), 0), max(paid_at) into _s, _posledna
    from public.purchase_invoice_payments where purchase_invoice_id = _id;
  _treba := public.prijata_suma_na_uhradu(_id);
  perform set_config('faktero.prepocet_uhrad', '1', true);
  if _treba <= 0 then
    -- Nie je čo doplatiť: celú (nenulovú) sumu pokryla zaplatená záloha.
    if abs(coalesce(_f.amount_total, 0)) > 0 and _f.status <> 'paid' then
      update public.purchase_invoices
         set status = 'paid', payment_date = coalesce(_posledna,
           (select z.payment_date from public.purchase_invoices z where z.id = _f.advance_invoice_id),
           _f.payment_date, current_date)
       where id = _id;
    end if;
  elsif _s >= _treba - 0.005 then
    if _f.status <> 'paid' or _f.payment_date is distinct from _posledna then
      update public.purchase_invoices set status = 'paid', payment_date = _posledna where id = _id;
    end if;
  elsif _f.status = 'paid' then
    update public.purchase_invoices
       set status = case when _f.zauctovane_at is not null then 'booked' else 'received' end, payment_date = null
     where id = _id;
  end if;
  perform set_config('faktero.prepocet_uhrad', '', true);
end $function$;
revoke all on function public.prepocitaj_uhrady_prijatej(uuid) from public, anon, authenticated;

create or replace function public.prijata_zaloha_prepocet_zavislych()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare _d record;
begin
  if new.type is distinct from 'proforma' or old.status is not distinct from new.status then return null; end if;
  for _d in select id from public.purchase_invoices
     where advance_invoice_id = new.id and company_id = new.company_id and deleted_at is null
  loop perform public.prepocitaj_uhrady_prijatej(_d.id); end loop;
  return null;
end $function$;
revoke all on function public.prijata_zaloha_prepocet_zavislych() from public, anon, authenticated;

drop trigger if exists purchase_invoices_zaloha_zavisle on public.purchase_invoices;
create trigger purchase_invoices_zaloha_zavisle after update of status on public.purchase_invoices
  for each row execute function public.prijata_zaloha_prepocet_zavislych();
