-- Kompletný export dát firmy.
--
-- Zákazník má právo na prenositeľnosť údajov (čl. 20 GDPR) a povinnosť
-- uchovávať doklady desať rokov ostáva aj po zrušení účtu — musí si teda vedieť
-- všetko stiahnuť. Balík je veľký, preto sa ukladá do úložiska a sťahuje sa
-- podpísaným odkazom, nie cez odpoveď servera.
insert into storage.buckets (id, name, public)
values ('export-firmy', 'export-firmy', false)
on conflict (id) do nothing;

-- Do priečinka svojej firmy vidí len jej člen; zapisuje server.
drop policy if exists "export firmy cita clen" on storage.objects;
create policy "export firmy cita clen" on storage.objects for select to authenticated
  using (
    bucket_id = 'export-firmy'
    and public.is_company_member((split_part(name, '/', 1))::uuid, auth.uid())
  );

drop policy if exists "export firmy maze clen" on storage.objects;
create policy "export firmy maze clen" on storage.objects for delete to authenticated
  using (
    bucket_id = 'export-firmy'
    and public.is_company_admin((split_part(name, '/', 1))::uuid, auth.uid())
  );
