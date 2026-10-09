-- Súbory podľa oblasti vlastnej roly (custom). Politiky úložiska kontrolovali len členstvo
-- vo firme, takže používateľ bez práva napr. na zamestnancov si cez Storage API vypísal a
-- stiahol ich dokumenty. Reštriktívne politiky dopĺňajú oblasť podľa bucketu; bucket bez
-- väzby na oblasť ostáva, ako bol.
create or replace function public.faktero_oblast_suboru(_bucket text, _meno text, _zapis boolean)
 returns boolean language plpgsql stable set search_path to ''
as $function$
declare
  oblast text;
  firma text;
begin
  oblast := case _bucket
    when 'employee-docs' then 'zamestnanci'
    when 'expense-receipts' then 'doklady'
    when 'purchase-invoices' then 'doklady'
    when 'nespracovane' then 'doklady'
    when 'other-docs' then 'ostatne'
    when 'financing-documents' then 'banka'
    when 'product-photos' then 'sklad'
    when 'invoice-pdfs' then 'faktury'
    else null end;
  if oblast is null then
    return true;
  end if;
  firma := split_part(_meno, '/', 1);
  if firma !~ '^[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return firma::uuid = any (public.firmy_s_pravom(oblast, _zapis));
end;
$function$;
revoke all on function public.faktero_oblast_suboru(text, text, boolean) from public, anon;
grant execute on function public.faktero_oblast_suboru(text, text, boolean) to authenticated, service_role;

create policy "oblast suborov citanie" on storage.objects as restrictive for select to authenticated
  using (public.faktero_oblast_suboru(bucket_id, name, false));
create policy "oblast suborov zapis" on storage.objects as restrictive for insert to authenticated
  with check (public.faktero_oblast_suboru(bucket_id, name, true));
create policy "oblast suborov uprava" on storage.objects as restrictive for update to authenticated
  using (public.faktero_oblast_suboru(bucket_id, name, true))
  with check (public.faktero_oblast_suboru(bucket_id, name, true));
create policy "oblast suborov mazanie" on storage.objects as restrictive for delete to authenticated
  using (public.faktero_oblast_suboru(bucket_id, name, true));
