-- Faktúra mala jedinú poznámku a tá sa tlačí až pod položkami. Text, ktorý
-- patrí nad ne — čoho sa dodávka týka, číslo objednávky, obdobie — sa dosiaľ
-- nemal kam napísať; ľudia ho dávali do názvu prvej položky.
alter table public.invoices
  add column if not exists intro_note text;

comment on column public.invoices.intro_note is
  'Text vytlačený nad tabuľkou položiek. `notes` ostáva textom pod nimi.';
