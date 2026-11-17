-- Účet pripojený v Banke (bank_accounts: TB API, GoCardless, Wise, import
-- výpisu…) sa sám stane aj bankovým účtom firmy (Firma → Bankové účty), aby
-- ho nikto nemusel prepisovať ručne. Len pridáva: existujúce účty firmy sa
-- nemenia a odpojenie banky účet firmy neodstráni.
--
-- Predvolený je nový účet len vtedy, keď firma ešte nemá žiadny — vystavené
-- faktúry majú účet v payment_*, takže sa ich to nedotkne.

-- Kód banky (SK, CZ) z IBAN-u → BIC a názov banky. Zrkadlo máp
-- v src/lib/faktero/bic-z-iban.ts a banka-z-iban.ts; zhodu stráži
-- test pripojene-ucty-sql.test.ts — pri zmene upraviť obe strany.
create or replace function public.banka_podla_iban(p_iban text, out swift text, out bank_name text)
language sql immutable set search_path = public as $$
  select m.swift, m.nazov
  from (values
    ('SK', '0200', 'SUBASKBX', 'Všeobecná úverová banka, a.s.'),
    ('SK', '0720', 'NBSBSKBX', 'Národná banka Slovenska'),
    ('SK', '0900', 'GIBASKBX', 'Slovenská sporiteľňa, a.s.'),
    ('SK', '1100', 'TATRSKBX', 'Tatra banka, a.s.'),
    ('SK', '1111', 'UNCRSKBX', 'UniCredit Bank Czech Republic and Slovakia, a.s.'),
    ('SK', '3000', 'SLZBSKBA', 'Slovenská záručná a rozvojová banka, a.s.'),
    ('SK', '3100', NULL, '365.bank, a.s.'),
    ('SK', '5200', 'OTPVSKBX', 'OTP Banka Slovensko, a.s.'),
    ('SK', '5600', 'KOMASK2X', 'Prima banka Slovensko, a.s.'),
    ('SK', '6500', NULL, '365.bank, a.s.'),
    ('SK', '7300', 'INGBSKBX', 'ING Bank N.V.'),
    ('SK', '7500', 'CEKOSKBX', 'Československá obchodná banka, a.s.'),
    ('SK', '7930', NULL, 'Wüstenrot stavebná sporiteľňa, a.s.'),
    ('SK', '8050', NULL, 'Commerzbank AG'),
    ('SK', '8120', NULL, 'Privatbanka, a.s.'),
    ('SK', '8180', 'SPSRSKBA', 'Štátna pokladnica'),
    ('SK', '8320', NULL, 'J&T BANKA, a.s.'),
    ('SK', '8330', 'FIOZSKBA', 'Fio banka, a.s.'),
    ('SK', '8360', 'BREXSKBX', 'mBank S.A.'),
    ('SK', '8420', NULL, 'BKS Bank AG'),
    ('CZ', '0100', 'KOMBCZPP', 'Komerční banka, a.s.'),
    ('CZ', '0300', 'CEKOCZPP', 'Československá obchodní banka, a.s.'),
    ('CZ', '0600', 'AGBACZPP', 'MONETA Money Bank, a.s.'),
    ('CZ', '0710', 'CNBACZPP', 'Česká národní banka'),
    ('CZ', '0800', 'GIBACZPX', 'Česká spořitelna, a.s.'),
    ('CZ', '2010', 'FIOBCZPP', 'Fio banka, a.s.'),
    ('CZ', '2250', NULL, 'Banka CREDITAS a.s.'),
    ('CZ', '2700', 'BACXCZPP', 'UniCredit Bank Czech Republic and Slovakia, a.s.'),
    ('CZ', '3030', 'AIRACZPP', 'Air Bank a.s.'),
    ('CZ', '3500', NULL, 'ING Bank N.V.'),
    ('CZ', '5500', 'RZBCCZPP', 'Raiffeisenbank a.s.'),
    ('CZ', '6210', 'BREXCZPP', 'mBank S.A.')
  ) as m(krajina, kod, swift, nazov)
  where upper(regexp_replace(coalesce(p_iban, ''), '\s', '', 'g')) ~ '^(SK|CZ)[0-9]{22}$'
    and m.krajina = left(upper(regexp_replace(p_iban, '\s', '', 'g')), 2)
    and m.kod = substr(upper(regexp_replace(p_iban, '\s', '', 'g')), 5, 4)
$$;
revoke all on function public.banka_podla_iban(text) from public, anon, authenticated;

-- Pridá pripojený účet medzi účty firmy, ak tam ešte nie je. Nikdy nezhodí
-- zápis do bank_accounts (synchronizácia banky musí prejsť aj tak).
create or replace function public.pripojeny_ucet_do_firmy(p_bank_account_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  ba record;
  i text;
  b_swift text;
  b_nazov text;
  meno text;
  predvoleny boolean;
  poradie int;
begin
  select a.company_id, a.iban, a.account_name, a.currency, c.name as firma
    into ba
    from public.bank_accounts a join public.companies c on c.id = a.company_id
    where a.id = p_bank_account_id;
  if not found then return; end if;

  i := upper(regexp_replace(coalesce(ba.iban, ''), '\s', '', 'g'));
  -- Ten istý tvar, aký pustí kontrola na company_bank_accounts.iban.
  if i !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$' then return; end if;

  -- Súbežné pripojenie viacerých účtov jednej firmy: predvolený vyberie len jeden.
  perform pg_advisory_xact_lock(hashtext('company_bank_accounts:' || ba.company_id::text));

  if exists (
    select 1 from public.company_bank_accounts
    where company_id = ba.company_id
      and upper(regexp_replace(iban, '\s', '', 'g')) = i
  ) then
    return;
  end if;

  select x.swift, x.bank_name into b_swift, b_nazov from public.banka_podla_iban(i) x;
  meno := nullif(btrim(coalesce(ba.account_name, '')), '');
  -- Banky často pomenujú účet menom firmy — v zozname by sa nedali rozlíšiť.
  if meno is null or lower(meno) = lower(btrim(coalesce(ba.firma, ''))) then
    meno := coalesce(b_nazov, 'Účet') || ' …' || right(i, 4);
  end if;

  select not exists (select 1 from public.company_bank_accounts where company_id = ba.company_id),
         coalesce(max(position) + 1, 0)
    into predvoleny, poradie
    from public.company_bank_accounts where company_id = ba.company_id;

  insert into public.company_bank_accounts
    (company_id, name, iban, swift, bank_name, currency, is_default, position)
  values
    (ba.company_id, meno, i, b_swift, b_nazov,
     coalesce(nullif(upper(btrim(ba.currency)), ''), 'EUR'), predvoleny, poradie)
  on conflict (company_id, iban) do nothing;
exception when others then
  raise warning 'pripojeny_ucet_do_firmy(%): %', p_bank_account_id, sqlerrm;
end $$;
revoke all on function public.pripojeny_ucet_do_firmy(uuid) from public, anon, authenticated;

create or replace function public.bank_accounts_do_firmy()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.iban is not null
     and (tg_op = 'INSERT' or new.iban is distinct from old.iban) then
    perform public.pripojeny_ucet_do_firmy(new.id);
  end if;
  return null;
end $$;
revoke all on function public.bank_accounts_do_firmy() from public, anon, authenticated;

drop trigger if exists bank_accounts_do_firmy on public.bank_accounts;
create trigger bank_accounts_do_firmy after insert or update of iban on public.bank_accounts
  for each row execute function public.bank_accounts_do_firmy();

-- Doplnenie už pripojených účtov. Ak firma nemá žiadny účet, predvoleným sa
-- stane účet v domácej mene firmy (potom najstarší).
do $$
declare r record;
begin
  for r in
    select a.id
    from public.bank_accounts a join public.companies c on c.id = a.company_id
    where a.iban is not null
    order by a.company_id,
             (a.currency = coalesce(c.default_currency,
                                    case when c.country = 'CZ' then 'CZK' else 'EUR' end)) desc,
             a.created_at, a.id
  loop
    perform public.pripojeny_ucet_do_firmy(r.id);
  end loop;
end $$;
