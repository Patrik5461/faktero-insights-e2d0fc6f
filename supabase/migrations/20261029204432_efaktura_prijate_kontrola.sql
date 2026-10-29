-- Automatická kontrola prijatej eFaktúry (EN 16931 / Peppol BIS) — výsledok
-- `skontrolujEfakturu` sa ukladá k dokladu pri prijatí. Prázdne = ešte
-- neskontrolované (staršie doklady dorobí jednorazový skript).
alter table public.efaktura_received_documents
  add column if not exists kontrola_vysledok jsonb,
  add column if not exists kontrola_chyby integer,
  add column if not exists kontrola_varovania integer,
  add column if not exists skontrolovane_at timestamptz;

comment on column public.efaktura_received_documents.kontrola_vysledok is
  'Výsledok automatickej kontroly eFaktúry: { verzia, platny, pocetPravidiel, nalezy: [{kod, zavaznost, oblast, popis, parametre, kategoria, cesta, riadok, stlpec}], orezane }';
comment on column public.efaktura_received_documents.kontrola_chyby is 'Počet chýb z automatickej kontroly (null = neskontrolované).';
comment on column public.efaktura_received_documents.kontrola_varovania is 'Počet varovaní z automatickej kontroly (null = neskontrolované).';
