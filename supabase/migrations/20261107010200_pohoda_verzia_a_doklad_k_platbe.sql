/*
  Audit 7. 11. 2026 (F2):

  1) `zvys_pohoda_verziu` — vrátenie z Pohody zvyšovalo `pohoda_verzia`
     čítaním a zápisom z aplikácie (read-modify-write po jednom riadku). Dve
     súbežné vrátenia toho istého dokladu by zvýšili verziu len raz a oprava
     by v Pohode narazila na duplicitu. Teraz jeden UPDATE `= pohoda_verzia + 1`.
     SECURITY INVOKER — platí RLS volajúceho, rovnako ako doterajší zápis.

  2) Jedna zálohová faktúra, jeden daňový doklad k prijatej platbe. Aplikácia
     to kontroluje SELECTom pred vložením, no dve súbežné vystavenia by prešli
     obe (tá istá daň priznaná dvakrát). Pred migráciou overené SELECTom:
     0 duplicít (7. 11. 2026).
*/

create or replace function public.zvys_pohoda_verziu(_tabulka text, _ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  _pocet integer := 0;
begin
  if _ids is null or cardinality(_ids) = 0 then
    return 0;
  end if;
  if _tabulka = 'invoices' then
    update public.invoices set pohoda_verzia = pohoda_verzia + 1 where id = any(_ids);
  elsif _tabulka = 'purchase_invoices' then
    update public.purchase_invoices set pohoda_verzia = pohoda_verzia + 1 where id = any(_ids);
  elsif _tabulka = 'expense_documents' then
    update public.expense_documents set pohoda_verzia = pohoda_verzia + 1 where id = any(_ids);
  elsif _tabulka = 'cash_entries' then
    update public.cash_entries set pohoda_verzia = pohoda_verzia + 1 where id = any(_ids);
  else
    raise exception 'Neznáma tabuľka pre verziu Pohody: %', _tabulka using errcode = '22023';
  end if;
  get diagnostics _pocet = row_count;
  return _pocet;
end
$$;
revoke all on function public.zvys_pohoda_verziu(text, uuid[]) from public, anon;
grant execute on function public.zvys_pohoda_verziu(text, uuid[]) to authenticated, service_role;

create unique index if not exists invoices_doklad_k_platbe_uniq
  on public.invoices (advance_invoice_id)
  where type = 'advance_payment' and deleted_at is null and advance_invoice_id is not null;

/*
  3) Predvolená pokladňa, ktorú založí databáza pri prvom doklade, sa volala
     „Pokladňa“ aj v českej či nemeckej firme. Názov podľa krajiny firmy —
     rovnako ako `nazovPredvolenejPokladne` v aplikácii (pokladne.ts).
     Inak bezo zmeny oproti 20261103163625_viac_pokladni.sql.
*/
create or replace function public.predvolena_pokladna(_firma uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  select id into _id from public.pokladne where company_id = _firma and predvolena limit 1;
  if _id is not null then
    return _id;
  end if;
  -- Pokladne sú, ale žiadna predvolená (nemalo by nastať) — vezmi prvú aktívnu.
  select id into _id from public.pokladne
   where company_id = _firma and aktivna order by poradie, created_at limit 1;
  if _id is not null then
    update public.pokladne set predvolena = true where id = _id;
    return _id;
  end if;
  insert into public.pokladne (company_id, nazov, kod_pohoda, predvolena)
  select c.id,
         case
           when upper(btrim(coalesce(c.country, ''))) ~ '^(CZ|CZE|ČESK|CESK|CZECH)' then 'Pokladna'
           when upper(btrim(coalesce(c.country, ''))) ~ '^(DE|DEU|NEMEC|GERMAN|DEUTSCH)' then 'Kasse'
           else 'Pokladňa'
         end,
         nullif(btrim(coalesce(c.pohoda_pokladna, '')), ''), true
    from public.companies c where c.id = _firma
  on conflict do nothing
  returning id into _id;
  if _id is null then
    select id into _id from public.pokladne where company_id = _firma and predvolena limit 1;
  end if;
  return _id;
end
$$;
revoke all on function public.predvolena_pokladna(uuid) from public, anon, authenticated;
grant execute on function public.predvolena_pokladna(uuid) to service_role;
