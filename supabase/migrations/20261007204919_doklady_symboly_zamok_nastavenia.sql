alter table public.purchase_invoices
  add column if not exists order_number text,
  add column if not exists delivery_note_number text,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;
alter table public.expense_documents
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid;
alter table public.companies
  add column if not exists pohoda_dobropis_kladny boolean not null default false,
  add column if not exists pohoda_parovaci_symbol text not null default 'vs',
  add column if not exists pohoda_predkontacia_zaokruhlenie text,
  add column if not exists qr_blocky_do_nespracovanych boolean not null default false,
  add column if not exists povinne_polia_dokladu text[] not null default '{}';
alter table public.companies drop constraint if exists companies_pohoda_parovaci_symbol_check;
alter table public.companies add constraint companies_pohoda_parovaci_symbol_check
  check (pohoda_parovaci_symbol in ('vs','dodaci_list','cislo'));

comment on column public.purchase_invoices.locked_at is 'Ručne zamknutý doklad — kľúčové polia sa nedajú meniť (spúšťač zamok_odovzdaneho_dokladu).';
comment on column public.companies.povinne_polia_dokladu is 'Polia povinné pri spracovaní dokladu: zakazka, stredisko, cinnost.';

create or replace function public.zamok_odovzdaneho_dokladu()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  _stlpce text[] := tg_argv;
  _s text;
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
  _odovzdany boolean := old.exported_at is not null and new.exported_at is not null;
  _zamknuty boolean := (_stare ->> 'locked_at') is not null and (_nove ->> 'locked_at') is not null;
begin
  if not _odovzdany and not _zamknuty then
    return new;
  end if;
  foreach _s in array _stlpce loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      if _odovzdany then
        raise exception 'Doklad je odovzdaný do Pohody — najprv ho vráťte z Pohody (%).', _s
          using errcode = 'P0001';
      else
        raise exception 'Doklad je zamknutý — najprv ho odomknite (%).', _s
          using errcode = 'P0001';
      end if;
    end if;
  end loop;
  return new;
end
$function$;
