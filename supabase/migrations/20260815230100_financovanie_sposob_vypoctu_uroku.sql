-- Ako sa počíta úrok — a odkedy.
--
-- Prvá skutočná zmluva (ČSOB Leasing, spotrebný úver) ukázala, že banka počíta
-- úrok podľa **skutočných dní** v období, nie podľa rovnakých dvanástin roka.
-- Preto úrok v ich kalendári neklesá plynulo: mesiac s 31 dňami má vyšší úrok
-- než predchádzajúci tridsaťdňový. Náš pôvodný výpočet dával celkovo o 1,08 €
-- menej a posledná splátka sedela o toľko isté vedľa.
--
-- `interest_from` je deň čerpania. Prvé obdobie je odo dňa, keď peniaze odišli,
-- do prvej splatnosti — a to nemusí byť presne mesiac. Bez neho by prvý riadok
-- sedieť nemohol.

ALTER TABLE public.financing_contracts
  ADD COLUMN day_count text NOT NULL DEFAULT 'ACT/365'
    CHECK (day_count IN ('ACT/365', 'ACT/360', '30E/360')),
  ADD COLUMN interest_from date;

COMMENT ON COLUMN public.financing_contracts.day_count IS
  'ACT/365 = úrok podľa skutočných dní (tak počítajú slovenské banky), 30E/360 = rovnaké dvanástiny roka.';
COMMENT ON COLUMN public.financing_contracts.interest_from IS
  'Deň čerpania. Keď chýba, prvé obdobie sa berie ako mesiac pred prvou splatnosťou.';
