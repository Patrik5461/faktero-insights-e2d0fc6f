/*
  Automatické overenie platiteľstva DPH v oficiálnych registroch.

  Slovenská firma sa hľadá v zoznamoch Finančnej správy (registrovaní pre DPH
  s paragrafom registrácie, platitelia s dôvodmi na zrušenie, vymazaní), česká
  v Registri plátců DPH (ADIS). Každá zmena výsledku sa zapíše do
  `dph_overenia` — to je dôkaz, čo register v ktorý deň povedal, a zároveň
  história registrácie firmy.

  Na firme:
    dph_auto_overenie  nastavenie „Automaticky overovať platiteľstvo DPH“ (predvolene áno)
    dph_overit_od      čaká na overenie (nová firma, zmena IČO / IČ DPH / DIČ / krajiny)
    dph_overene_at     kedy sa firma v registri naposledy overovala

  Spätne kompatibilné: starý kód nové stĺpce nepozná a nič nevyžadujú.
*/
alter table public.companies
  add column if not exists dph_auto_overenie boolean not null default true,
  add column if not exists dph_overit_od timestamptz,
  add column if not exists dph_overene_at timestamptz;
