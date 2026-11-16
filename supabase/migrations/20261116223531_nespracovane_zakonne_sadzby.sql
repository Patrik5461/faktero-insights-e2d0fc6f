-- Nespracované doklady: sadzba DPH mimo zákonných sa neuloží (2026-11-16).
--
-- Patrik: „To sa nesmie stať, aby si to vymýšľalo sadzbu.“ (RHJ METRO 21 %
-- v roku 2023, BÝVAJLEPŠIE notár 21 % v roku 2026.) Aplikácia pustí výsledok
-- čítania len cez bránu `zakonne-sadzby-ai.ts`; toto je poistka v databáze
-- pre ktorýkoľvek iný zápis (server, skript, staršia verzia aplikácie).
--
-- Na rozdiel od purchase_invoices / expense_documents (spúšťač
-- zzz_faktero_dph_zakonne_sadzby zápis ODMIETNE) sa tu zápis neodmieta —
-- človek by prišiel o rozpracované údaje. Riadok rozpisu s nepovolenou
-- sadzbou sa vyhodí, sadzba položky sa vymaže (null) a do
-- `udaje.kontrolaDph.dovod` sa zapíše, prečo — doklad je „na kontrole“
-- a rozpis doplní človek (výber v aplikácii ponúka len zákonné sadzby).
--
-- Pravidlá ako faktero_chyba_dph: sadzby krajiny firmy k dátumu dodania
-- (inak vystavenia); záporný riadok / položka a dobropis smú historickú
-- sadzbu krajiny; riadok bez dane (0 %, prenesenie) je v poriadku;
-- zahraničný dodávateľ (krajina alebo prefix IČ DPH ≠ krajina firmy) sa
-- nekontroluje (sadzby jeho štátu overuje aplikácia).

create or replace function public.faktero_nespracovane_zakonne_sadzby()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _u jsonb := new.udaje;
  _krajina text;
  _den date;
  _txt text;
  _kd text;
  _povolene numeric[];
  _historicke numeric[];
  _r jsonb;
  _p jsonb;
  _sadzba numeric;
  _z numeric;
  _d numeric;
  _bez_dane boolean;
  _novy_rozpis jsonb := '[]'::jsonb;
  _nove_polozky jsonb := '[]'::jsonb;
  _zle numeric[] := array[]::numeric[];
  _zmena_rozpisu boolean := false;
  _zmena_poloziek boolean := false;
  _sum_z numeric := 0;
  _sum_d numeric := 0;
begin
  if _u is null or jsonb_typeof(_u) <> 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.udaje is not distinct from old.udaje then
    return new;
  end if;

  select public.faktero_krajina_dane(c.country) into _krajina
    from public.companies c where c.id = new.company_id;
  _krajina := coalesce(_krajina, 'SK');

  _txt := coalesce(nullif(_u ->> 'datumDodania', ''), nullif(_u ->> 'datumVystavenia', ''));
  if _txt ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      _den := left(_txt, 10)::date;
    exception when others then
      _den := null;
    end;
  end if;

  _kd := public.faktero_krajina_dodavatela(_u -> 'dodavatel' ->> 'krajina', _u -> 'dodavatel' ->> 'icDph');
  if _kd is not null and _kd <> _krajina then
    return new;
  end if;

  _historicke := public.faktero_zakonne_sadzby(_krajina, null);
  _povolene := case when coalesce(new.druh, '') = 'dobropis' then _historicke
                    else public.faktero_zakonne_sadzby(_krajina, _den) end;

  -- Rozpis DPH.
  if jsonb_typeof(_u -> 'rozpis') = 'array' then
    for _r in select value from jsonb_array_elements(_u -> 'rozpis') loop
      _sadzba := public.faktero_jsonb_cislo(_r -> 'sadzba');
      _z := public.faktero_jsonb_cislo(_r -> 'zaklad');
      _d := public.faktero_jsonb_cislo(_r -> 'dph');
      _sum_z := _sum_z + abs(_z);
      _sum_d := _sum_d + abs(_d);
      _bez_dane := abs(_d) < 0.005;
      if _sadzba = any(_povolene)
         or (_bez_dane and (_sadzba = 0 or coalesce(_r ->> 'vat_category', '') = 'reverse_charge'
                            or coalesce((_r ->> 'pdp')::boolean, false)))
         or ((_z < 0 or _d < 0) and _sadzba = any(_historicke)) then
        _novy_rozpis := _novy_rozpis || jsonb_build_array(_r);
      else
        _zle := array_append(_zle, _sadzba);
        _zmena_rozpisu := true;
      end if;
    end loop;
  end if;

  -- Sadzby položiek.
  if jsonb_typeof(_u -> 'polozky') = 'array' then
    for _p in select value from jsonb_array_elements(_u -> 'polozky') loop
      if _p ? 'vat_rate' and jsonb_typeof(_p -> 'vat_rate') not in ('null') then
        _sadzba := public.faktero_jsonb_cislo(_p -> 'vat_rate');
        if not (_sadzba = any(_povolene))
           and not (public.faktero_jsonb_cislo(coalesce(_p -> 'total', _p -> 'unit_price')) < 0
                    and _sadzba = any(_historicke)) then
          _zle := array_append(_zle, _sadzba);
          _p := jsonb_set(_p, '{vat_rate}', 'null'::jsonb);
          _zmena_poloziek := true;
        end if;
      end if;
      _nove_polozky := _nove_polozky || jsonb_build_array(_p);
    end loop;
  end if;

  if not (_zmena_rozpisu or _zmena_poloziek) then
    return new;
  end if;

  if _zmena_rozpisu then
    _u := jsonb_set(_u, '{rozpis}', _novy_rozpis);
    _u := jsonb_set(
      _u,
      '{kontrolaDph}',
      jsonb_build_object(
        'bezDph', coalesce(public.faktero_jsonb_cislo(_u -> 'kontrolaDph' -> 'bezDph'), 0) + case when _u -> 'kontrolaDph' is null then round(_sum_z, 2) else 0 end,
        'dph', coalesce(public.faktero_jsonb_cislo(_u -> 'kontrolaDph' -> 'dph'), 0) + case when _u -> 'kontrolaDph' is null then round(_sum_d, 2) else 0 end,
        'dovod', 'Sadzbu DPH ' || array_to_string(array(select distinct x from unnest(_zle) x order by x), ', ') || ' % na doklade nevieme prečítať — zákonné sú '
                 || array_to_string(_povolene, ', ') || ' %. Rozpis DPH doplňte podľa dokladu (a skontrolujte dátum dodania).'
      )
    );
  end if;
  if _zmena_poloziek then
    _u := jsonb_set(_u, '{polozky}', _nove_polozky);
  end if;
  new.udaje := _u;
  return new;
end
$$;

revoke all on function public.faktero_nespracovane_zakonne_sadzby() from public, anon, authenticated;

drop trigger if exists zzz_faktero_nespracovane_zakonne_sadzby on public.nespracovane_doklady;
create trigger zzz_faktero_nespracovane_zakonne_sadzby
  before insert or update of udaje, druh
  on public.nespracovane_doklady
  for each row execute function public.faktero_nespracovane_zakonne_sadzby();
