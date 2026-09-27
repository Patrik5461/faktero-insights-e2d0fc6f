-- Jazyk dokladu.
--
-- Cudziu menu Faktero vedelo, ale PDF chodilo vždy po slovensky — odberateľ
-- v Rakúsku alebo Česku dostal doklad, ktorému nerozumie. Jazyk sa pamätá na
-- faktúre (aby sa doklad znovu vygeneroval rovnako aj o rok) a predvolí sa
-- z odberateľa, nech sa pri každej ďalšej faktúre nenastavuje znovu.
alter table public.invoices
  add column if not exists language text;

alter table public.customers
  add column if not exists invoice_language text;

comment on column public.invoices.language is
  'Jazyk PDF dokladu (sk, cs, en, de, hu). NULL = slovenčina.';
comment on column public.customers.invoice_language is
  'Predvolený jazyk dokladov pre tohto odberateľa. NULL = slovenčina.';

-- Cudzí jazyk je výnimka, nie pravidlo — hodnota sa preto nekontroluje
-- číselníkom v databáze, ale pri zápise; neznámy kód aplikácia prečíta ako
-- slovenčinu a doklad ostane čitateľný.
