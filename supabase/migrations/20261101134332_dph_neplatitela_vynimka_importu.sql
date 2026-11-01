-- Výnimka z poistky „neplatiteľ nesmie mať DPH“ pre import histórie.
-- Import (SuperFaktúra, Pohoda/ISDOC cez import-superfaktura.server.ts a
-- migrácia z Doklada scripts/migrate-doklado) zapisuje vždy servisným kľúčom
-- a nastaví invoices.import_source. Bežný klient (authenticated/anon) si
-- import_source nastaviť vie, ale rolu nie — preto výnimka platí len pre
-- zápis mimo rolí authenticated/anon A zároveň s import_source na doklade.
-- Importovaný doklad s DPH u neplatiteľa dostane upozornenie do komentára
-- (interný, do účtovníctva nejde) a detail faktúry ukáže odznak.

create or replace function public.invoices_dph_neplatitela()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  upozornenie constant text := 'Import: firma nie je platiteľ DPH, ale doklad zo zdroja nesie DPH. Skontrolujte ho.';
begin
  if coalesce(new.vat_total, 0) <> 0
     and (tg_op = 'INSERT' or new.vat_total is distinct from old.vat_total or new.company_id is distinct from old.company_id)
     and exists (select 1 from public.companies c where c.id = new.company_id and c.vat_payer = false) then
    if current_user not in ('authenticated', 'anon') and nullif(btrim(coalesce(new.import_source, '')), '') is not null then
      if position(upozornenie in coalesce(new.komentar, '')) = 0 then
        new.komentar := case when coalesce(btrim(new.komentar), '') = '' then upozornenie
                             else upozornenie || E'\n' || new.komentar end;
      end if;
      return new;
    end if;
    raise exception 'Firma nie je platiteľ DPH — faktúra nesmie mať DPH. Nastavte sadzbu 0 %%.' using errcode = 'P0001';
  end if;
  return new;
end $function$;

create or replace function public.invoice_items_dph_neplatitela()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (coalesce(new.vat_amount, 0) <> 0 or coalesce(new.vat_rate, 0) <> 0)
     and (tg_op = 'INSERT'
          or new.vat_amount is distinct from old.vat_amount
          or new.vat_rate is distinct from old.vat_rate
          or new.invoice_id is distinct from old.invoice_id)
     and exists (
       select 1 from public.invoices i join public.companies c on c.id = i.company_id
       where i.id = new.invoice_id and c.vat_payer = false
         and not (current_user not in ('authenticated', 'anon')
                  and nullif(btrim(coalesce(i.import_source, '')), '') is not null)
     ) then
    raise exception 'Firma nie je platiteľ DPH — položka „%“ nesmie mať DPH. Nastavte sadzbu 0 %%.', new.name using errcode = 'P0001';
  end if;
  return new;
end $function$;
