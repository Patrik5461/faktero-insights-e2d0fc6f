-- Kontroly migrácie 20261105210000_parovanie_inych_dokladov.sql.
--
-- Celé beží v jednom DO bloku, ktorý na konci VŽDY vyhodí výnimku — Postgres
-- tak vráti migráciu aj testovacie riadky späť. Úspech = hláška „TEST_OK …“,
-- čokoľvek iné je chyba.
--
-- Bežne sa púšťa v PGlite bez ostrej databázy:
--   node supabase/testy/20261105210000_parovanie_inych_dokladov.pglite.mjs
-- (návod v hlavičke skriptu; ten miesto značky nižšie dá prázdny príkaz).
--
-- Proti kópii/ostrej databáze len so súhlasom: miesto značky %%MIGRACIA%% vložiť
-- celý súbor migrácie a pustiť; lock_timeout zastaví test, ak sa zámok na
-- bank_transactions nedá dostať do 3 s.
do $test$
declare
  _a uuid;
  _b uuid;
  _t1 uuid;
  _t2 uuid;
  _d1 uuid := gen_random_uuid();
  _d2 uuid := gen_random_uuid();
  _n int;
  _ok text[] := '{}';
begin
  perform set_config('lock_timeout', '3s', true);
  execute $mig$
%%MIGRACIA%%
  $mig$;
  _ok := array_append(_ok, 'migracia');

  -- Firma s dvoma voľnými odchádzajúcimi pohybmi a iná firma.
  select t.company_id into _a
    from public.bank_transactions t
   where t.amount < 0 and t.matched_invoice_id is null and t.matched_purchase_invoice_id is null
     and t.matched_expense_id is null and t.matched_installment_id is null
   group by t.company_id having count(*) >= 2 limit 1;
  select id into _b from public.companies where id <> _a limit 1;
  select id into _t1 from public.bank_transactions
   where company_id = _a and amount < 0 and matched_invoice_id is null and matched_purchase_invoice_id is null
     and matched_expense_id is null and matched_installment_id is null order by id limit 1;
  select id into _t2 from public.bank_transactions
   where company_id = _a and amount < 0 and matched_invoice_id is null and matched_purchase_invoice_id is null
     and matched_expense_id is null and matched_installment_id is null and id <> _t1 order by id limit 1;

  insert into public.other_documents(id, company_id, kind, sender, subject, received_date, amount, currency, status, variable_symbol, iban)
  values (_d1, _a, 'socialna_zdravotna', 'Sociálna poisťovňa', 'TEST predpis', current_date, 123.45, 'EUR', 'new', '1234567890', 'SK3181800000007000155733'),
         (_d2, _b, 'danovy_urad', 'Daňový úrad', 'TEST výmer', current_date, 50, 'EUR', 'new', null, null);

  -- Spárovanie v rámci firmy prejde a zapíše históriu k inému dokladu.
  update public.bank_transactions set matched_other_document_id = _d1 where id = _t1;
  select count(*) into _n from public.historia_dokladov where agenda = 'ostatny' and doklad_id = _d1 and pole = '_platba';
  if _n <> 1 then raise exception 'TEST_FAIL historia parovania: %', _n; end if;
  _ok := array_append(_ok, 'historia');

  -- Cudzia firma: strážca odmietne.
  begin
    update public.bank_transactions set matched_other_document_id = _d2 where id = _t2;
    raise exception 'TEST_FAIL cudzi doklad presiel';
  exception when others then
    if sqlerrm not like 'Doklad nepatrí k tejto firme%' then raise exception 'TEST_FAIL strazca: %', sqlerrm; end if;
  end;
  _ok := array_append(_ok, 'strazca');

  -- Presun pohybu do inej firmy s väzbou: strážca odmietne aj to.
  begin
    update public.bank_transactions set company_id = _b where id = _t1;
    raise exception 'TEST_FAIL presun firmy presiel';
  exception when others then
    if sqlerrm not like 'Doklad nepatrí k tejto firme%' then raise exception 'TEST_FAIL presun: %', sqlerrm; end if;
  end;
  _ok := array_append(_ok, 'presun');

  -- Jeden doklad = jeden pohyb.
  begin
    update public.bank_transactions set matched_other_document_id = _d1 where id = _t2;
    raise exception 'TEST_FAIL druhy pohyb presiel';
  exception when unique_violation then null;
  end;
  _ok := array_append(_ok, 'unikat');

  -- Dĺžka VS.
  begin
    update public.other_documents set variable_symbol = repeat('1', 21) where id = _d1;
    raise exception 'TEST_FAIL dlhy VS presiel';
  exception when check_violation then null;
  end;
  _ok := array_append(_ok, 'vs');

  -- História sleduje paid_at; zrušenie väzby sa zapíše.
  update public.other_documents set paid_at = current_date where id = _d1;
  select count(*) into _n from public.historia_dokladov where agenda = 'ostatny' and doklad_id = _d1 and pole = 'paid_at';
  if _n <> 1 then raise exception 'TEST_FAIL historia paid_at: %', _n; end if;
  update public.bank_transactions set matched_other_document_id = null where id = _t1;
  select count(*) into _n from public.historia_dokladov where agenda = 'ostatny' and doklad_id = _d1 and pole = '_platba';
  if _n <> 2 then raise exception 'TEST_FAIL historia zrusenia: %', _n; end if;
  _ok := array_append(_ok, 'zrusenie');

  -- Zmazanie dokladu väzbu vynuluje (on delete set null).
  update public.bank_transactions set matched_other_document_id = _d1 where id = _t1;
  delete from public.other_documents where id = _d1;
  if (select matched_other_document_id from public.bank_transactions where id = _t1) is not null then
    raise exception 'TEST_FAIL vazba po zmazani ostala';
  end if;
  _ok := array_append(_ok, 'zmazanie');

  -- Pravidlá bez dokladu sa dajú zavolať (funkcia sa skompilovala).
  perform public.faktero_vybav_pohyby_pravidlami(_a);
  _ok := array_append(_ok, 'pravidla');

  raise exception 'TEST_OK %', array_to_string(_ok, ',');
end
$test$;
