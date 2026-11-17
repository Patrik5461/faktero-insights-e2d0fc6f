-- Nespracované doklady: druh „uhrada“ — Doklad o úhrade (2026-11-17).
--
-- RHJ s. r. o. dostala z Doklada PDF s blokom z eKasy „ÚHRADA FAKTÚRY —
-- Faktúra č. 0/0/0002/052152 621,70 — KARTA 621,70“ (METRO). Nie je to
-- daňový doklad, len potvrdenie, že prijatá faktúra bola zaplatená. Druh
-- „uhrada“ ho priradí k prijatej faktúre (príloha + úhrada) — aplikácia
-- `nespracovane-uhrada.ts`.
--
-- 1. Kontrola druhu pustí 'uhrada'.
-- 2. Poistka zákonných sadzieb (zzz_faktero_nespracovane_zakonne_sadzby)
--    pri doklade o úhrade sadzby nekontroluje — rozpis DPH vyprázdni
--    a dôvod kontroly DPH (`kontrolaDph`) zmaže.
alter table public.nespracovane_doklady drop constraint if exists nespracovane_doklady_druh_check;
alter table public.nespracovane_doklady add constraint nespracovane_doklady_druh_check
  check (druh in ('faktura', 'zalohova', 'danovy', 'dobropis', 'blocek', 'ostatny', 'vydana', 'uhrada'));

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
  /*
    Doklad o úhrade (bloček „ÚHRADA FAKTÚRY“) nie je daňový doklad — DPH
    nemá. Rozpis a dôvod kontroly DPH sa vyprázdnia, sadzby sa neoverujú.
  */
  if coalesce(new.druh, '') = 'uhrada' then
    if jsonb_typeof(_u -> 'rozpis') = 'array' and jsonb_array_length(_u -> 'rozpis') > 0 then
      _u := jsonb_set(_u, '{rozpis}', '[]'::jsonb);
    end if;
    _u := _u - 'kontrolaDph';
    if _u is distinct from new.udaje then
      new.udaje := _u;
    end if;
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
