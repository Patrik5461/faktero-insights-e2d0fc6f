/*
  Partneri a e-mailová brána.

  - customers.povinne_cislo_objednavky — partner chce na doklade číslo svojej
    objednávky; keď chýba, Faktero upozorní (pri vystavení faktúry a
    v Nespracovaných). Neblokuje.
  - companies.pohoda_ico_z_mena — partnerovi bez IČO (zahraničný, fyzická
    osoba) sa pri exporte do Pohody pošle stabilný náhradný identifikátor
    odvodený z mena, aby ho Pohoda v adresári spárovala vždy s tou istou kartou.
  - companies.mail_ukladat_bez_dokladu — e-mail bez prílohy s dokladom sa
    uloží do Nespracovaných ako PDF s textom mailu (inak len do zoznamu správ).
*/
alter table public.customers
  add column if not exists povinne_cislo_objednavky boolean not null default false;
alter table public.companies
  add column if not exists pohoda_ico_z_mena boolean not null default false,
  add column if not exists mail_ukladat_bez_dokladu boolean not null default false;
