-- Uzamknuté obdobie (companies.locked_until) aj pre bločky (expense_documents).
--
-- Rovnaké pravidlo ako pri faktúrach a prijatých faktúrach: doklad s dátumom
-- v uzavretom období sa už nedá meniť (sumy, DPH, dátum, dodávateľ, číslo),
-- mazať ani doňho pridať. Voľné ostáva zaúčtovanie, úhrada, zákazka, poznámka,
-- stav odovzdania (exported_at) a kurz — tie sa dejú aj po uzávierke.
--
-- Rozdiel oproti faktúram: bloček v stave „new“ (nespracovaný, čaká na
-- kontrolu) ešte nie je v účtovníctve ani v DPH. Taký sa dá založiť, upraviť,
-- zmazať aj presunúť do Nespracovaných dokladov. Do účtovníctva vstupuje až
-- spracovaním (status new → processed/exported) — vtedy sa kontroluje ako
-- nový doklad, a vrátenie späť medzi nespracované ako zmazanie.
-- Položky (items) chránené nie sú: nesú aj predkontáciu po riadkoch, ktorú
-- zaúčtovanie dopĺňa aj po uzávierke; sumy dokladu sú chránené v hlavičke.

create or replace function public.guard_locked_period_expense()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  novy jsonb := null;
  stary jsonb := null;
  zamok date;
  d_novy date;
  d_stary date;
  i int;
  zmena boolean := false;
  stary_v_uctovnictve boolean;
  novy_v_uctovnictve boolean;
begin
  if tg_op <> 'DELETE' then novy := to_jsonb(new); end if;
  if tg_op <> 'INSERT' then stary := to_jsonb(old); end if;

  stary_v_uctovnictve := stary is not null and coalesce(stary ->> 'status', 'new') <> 'new';
  novy_v_uctovnictve := novy is not null and coalesce(novy ->> 'status', 'new') <> 'new';

  -- Nespracovaný bloček nie je v účtovníctve — zámok sa ho netýka.
  if not stary_v_uctovnictve and not novy_v_uctovnictve then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select c.locked_until into zamok
    from public.companies c
   where c.id = (coalesce(novy, stary) ->> 'company_id')::uuid;

  if zamok is not null then
    d_novy := nullif(novy ->> tg_argv[0], '')::date;
    d_stary := nullif(stary ->> tg_argv[0], '')::date;

    if not stary_v_uctovnictve then
      -- Vstup do účtovníctva (nový spracovaný bloček, spracovanie nespracovaného).
      zmena := coalesce(d_novy <= zamok, false);
    elsif not novy_v_uctovnictve then
      -- Odchod z účtovníctva (zmazanie, vrátenie medzi nespracované).
      zmena := coalesce(d_stary <= zamok, false);
    elsif coalesce(d_novy <= zamok, false) or coalesce(d_stary <= zamok, false) then
      for i in 1 .. array_length(tg_argv, 1) - 1 loop
        if (novy -> tg_argv[i]) is distinct from (stary -> tg_argv[i]) then
          zmena := true;
          exit;
        end if;
      end loop;
    end if;

    if zmena then
      raise exception
        'Obdobie je uzamknuté do %. Doklad z uzavretého obdobia sa už nedá meniť ani mazať.',
        to_char(zamok, 'DD.MM.YYYY');
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $function$;

revoke all on function public.guard_locked_period_expense() from public, anon, authenticated;

drop trigger if exists expense_documents_locked_period on public.expense_documents;
create trigger expense_documents_locked_period
  before insert or update or delete on public.expense_documents
  for each row execute function public.guard_locked_period_expense(
    'issue_date',
    'issue_date', 'document_number', 'supplier_name', 'supplier_ico', 'supplier_ic_dph',
    'total_amount', 'net_amount', 'vat_amount', 'vat_rate', 'vat_breakdown', 'currency'
  );
