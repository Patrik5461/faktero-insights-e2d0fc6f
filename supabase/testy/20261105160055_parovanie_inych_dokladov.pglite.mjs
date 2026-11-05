/*
  Test migrácie 20261105160055_parovanie_inych_dokladov.sql v PGlite (Postgres
  vo WebAssembly) — bez ostrej databázy. Pripraví minimálnu kostru tabuliek
  a funkcií, ktoré migrácia predpokladá (stĺpce a `zapis_historiu_dokladu`
  podľa produkcie k 2026-11-05), pustí migráciu dvakrát (musí byť opakovateľná)
  a potom kontroly z `20261105160055_parovanie_inych_dokladov.test.sql`.

  PGlite nie je v závislostiach projektu; spúšťa sa z vlastného priečinka:

    mkdir -p /tmp/pglite-test && (cd /tmp/pglite-test && npm i @electric-sql/pglite@0.3)
    PGLITE=/tmp/pglite-test/node_modules/@electric-sql/pglite/dist/index.js \
      node supabase/testy/20261105160055_parovanie_inych_dokladov.pglite.mjs
*/
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const tu = dirname(fileURLToPath(import.meta.url));
const { PGlite } = await import(process.env.PGLITE ?? "@electric-sql/pglite");
const db = new PGlite();

const KOSTRA = `
create role anon; create role authenticated; create role service_role;
create table public.companies (id uuid primary key default gen_random_uuid(), name text);
create table public.bank_accounts (id uuid primary key default gen_random_uuid(), company_id uuid, iban text);
create table public.other_documents (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  kind text not null default 'ine', sender text, subject text, received_date date not null default current_date,
  amount numeric, currency text not null default 'EUR', due_date date, note text, status text not null default 'new',
  processed_at timestamptz, processed_by uuid, exported_at timestamptz, employee_id uuid, financing_contract_id uuid,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  priecinok text, inbox_message_id uuid, stitky text[] not null default '{}', nahrane_at timestamptz, odosielatel_mailu text);
create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, bank_account_id uuid not null,
  booking_date date not null, amount numeric not null, currency text not null default 'EUR', variable_symbol text,
  counterparty text, description text, transaction_reference text, matched_invoice_id uuid,
  created_at timestamptz not null default now(), matched_installment_id uuid, matched_expense_id uuid,
  matched_purchase_invoice_id uuid, zdroj text, counterparty_iban text, vybavenie text, vybavenie_poznamka text,
  vybavenie_pravidlo_id uuid, vybavene_at timestamptz, vybavil uuid);
create table public.payments (id uuid primary key default gen_random_uuid(), bank_transaction_id uuid);
create table public.financing_charges (id uuid primary key default gen_random_uuid(), bank_transaction_id uuid);
create table public.pravidla_uctovania (id uuid primary key default gen_random_uuid(), poznamka text);
create table public.historia_dokladov (
  id uuid primary key default gen_random_uuid(), company_id uuid not null, agenda text not null, doklad_id uuid not null,
  pole text not null, pred jsonb, po jsonb, kto uuid, kedy timestamptz not null default now(), kto_typ text, kto_popis text);
create function public.faktero_kto_historie(_nove jsonb, _stare jsonb, _vlozenie boolean,
  out kto uuid, out typ text, out popis text) language sql as $$ select null::uuid, 'system'::text, null::text $$;
create function public.faktero_suhrn_poloziek(_p jsonb) returns jsonb language sql as $$ select _p $$;
create function public.faktero_premenne_poznamky(_text text, _den date) returns text language sql as $$ select _text $$;
create function public.faktero_pravidlo_bez_dokladu(_company uuid, _ucet text, _suma numeric, _iban text, _vs text,
  _protistrana text, _popis text) returns public.pravidla_uctovania language sql as $$ select null::public.pravidla_uctovania $$;
-- Rovnaká ako v produkcii (skrátená o vetvu zaúčtovania pri vložení, ktorú iné doklady nemajú).
create function public.zapis_historiu_dokladu() returns trigger language plpgsql security definer set search_path to 'public' as $f$
declare
  _stare jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  _nove jsonb := to_jsonb(new);
  _agenda text := case tg_table_name when 'purchase_invoices' then 'prijata' when 'invoices' then 'faktura'
                    when 'other_documents' then 'ostatny' else 'doklad' end;
  _k record; _s text;
begin
  if tg_op = 'UPDATE' and not exists (select 1 from unnest(tg_argv) a(s) where (_stare -> a.s) is distinct from (_nove -> a.s)) then
    return new;
  end if;
  select * into _k from public.faktero_kto_historie(_nove, _stare, tg_op = 'INSERT');
  if tg_op = 'INSERT' then
    insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, kto, kto_typ, kto_popis)
    values (new.company_id, _agenda, new.id, '_vytvoreny', _k.kto, _k.typ, _k.popis);
    return new;
  end if;
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      insert into public.historia_dokladov(company_id, agenda, doklad_id, pole, pred, po, kto, kto_typ, kto_popis)
      values (new.company_id, _agenda, new.id, _s, _stare -> _s, _nove -> _s, _k.kto, _k.typ, _k.popis);
    end if;
  end loop;
  return new;
end $f$;
-- Dáta: firma A s dvoma odchádzajúcimi pohybmi, firma B.
insert into public.companies(id, name) values ('00000000-0000-0000-0000-00000000000a', 'A'), ('00000000-0000-0000-0000-00000000000b', 'B');
insert into public.bank_transactions(company_id, bank_account_id, booking_date, amount)
values ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date, -123.45),
       ('00000000-0000-0000-0000-00000000000a', gen_random_uuid(), current_date, -50);
`;

const migracia = readFileSync(
  join(tu, "../migrations/20261105160055_parovanie_inych_dokladov.sql"),
  "utf8",
);
const kontroly = readFileSync(join(tu, "20261105160055_parovanie_inych_dokladov.test.sql"), "utf8")
  // Migrácia je už pustená vyššie; v DO bloku ostane prázdny príkaz.
  .replaceAll("%%MIGRACIA%%", "select 1");

await db.exec(KOSTRA);
await db.exec(migracia);
await db.exec(migracia); // opakované spustenie nesmie spadnúť
try {
  await db.exec(kontroly);
  console.error("CHYBA: test nevyhodil TEST_OK");
  process.exit(1);
} catch (e) {
  const sprava = String(e?.message ?? e);
  if (!sprava.startsWith("TEST_OK")) {
    console.error(sprava);
    process.exit(1);
  }
  console.log(sprava);
}
// Strážca nesmie byť volateľný z API (PUBLIC/anon/authenticated bez EXECUTE).
const acl = await db.query(
  "select has_function_privilege('anon', 'public.bank_transactions_iny_doklad_guard()', 'execute') a, has_function_privilege('authenticated', 'public.bank_transactions_iny_doklad_guard()', 'execute') b",
);
if (acl.rows[0].a || acl.rows[0].b) {
  console.error("CHYBA: strážca je volateľný z API", acl.rows[0]);
  process.exit(1);
}
console.log("ACL strážcu OK");
