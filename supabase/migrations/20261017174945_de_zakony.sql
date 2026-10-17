-- Nemecká firma (krajina DE) — zdaňovanie, obdobie UStVA a upozornenie na faktúre.
--
-- Nové stĺpce sa týkajú len nemeckých firiem; slovenským a českým nič nemenia
-- (predvolené hodnoty zodpovedajú doterajšiemu správaniu).
--
-- Politiky RLS ani GRANTy netreba meniť: ide o stĺpce existujúcich tabuliek
-- `companies` a `invoices`, ktoré už majú politiky oblasti aj `mfa_ok()`.

-- § 13 / § 20 UStG: Soll (podľa dodania) alebo Ist (podľa prijatých platieb).
alter table public.companies
  add column if not exists de_versteuerung text not null default 'soll',
  -- § 18 Abs. 2 UStG: mesačne alebo štvrťročne (určuje Finanzamt).
  add column if not exists de_ustva_obdobie text not null default 'mesacne',
  -- § 46 UStDV: Dauerfristverlängerung — termín UStVA o mesiac neskôr.
  add column if not exists de_dauerfrist boolean not null default false;

alter table public.companies drop constraint if exists companies_de_versteuerung_chk;
alter table public.companies add constraint companies_de_versteuerung_chk
  check (de_versteuerung in ('soll', 'ist'));
alter table public.companies drop constraint if exists companies_de_ustva_obdobie_chk;
alter table public.companies add constraint companies_de_ustva_obdobie_chk
  check (de_ustva_obdobie in ('mesacne', 'stvrtrocne'));

comment on column public.companies.de_versteuerung is
  'DE: soll = Versteuerung nach vereinbarten Entgelten, ist = nach vereinnahmten Entgelten (§ 20 UStG) — UStVA počíta výstupnú daň podľa úhrad.';
comment on column public.companies.de_ustva_obdobie is
  'DE: Voranmeldungszeitraum UStVA — mesacne / stvrtrocne.';
comment on column public.companies.de_dauerfrist is
  'DE: Dauerfristverlängerung (§ 46 UStDV) — termín UStVA o mesiac neskôr; pri mesačnom podávaní Sondervorauszahlung (KZ 39).';

-- § 14 Abs. 4 Nr. 9 UStG: stavebné plnenie / plnenie s pozemkom pre súkromnú
-- osobu — na faktúru ide upozornenie na úschovu 2 roky (§ 14b Abs. 1 S. 5).
alter table public.invoices
  add column if not exists de_hinweis_aufbewahrung boolean not null default false;

comment on column public.invoices.de_hinweis_aufbewahrung is
  'DE: na faktúru sa vytlačí upozornenie na povinnú úschovu 2 roky (§ 14 Abs. 4 Nr. 9, § 14b Abs. 1 S. 5 UStG).';
