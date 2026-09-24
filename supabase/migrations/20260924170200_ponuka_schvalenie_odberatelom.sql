-- Prijatie alebo zamietnutie cenovej ponuky odberateľom.
--
-- Ponuka sa doteraz posielala ako PDF v prílohe a odpoveď chodila e-mailom
-- alebo telefónom; stav v Fakteru prepínal ten, kto ponuku vystavil. Teraz má
-- odberateľ v e-maile odkaz s tlačidlami a stav sa prepne sám — aj s dátumom
-- a prípadným dôvodom zamietnutia, ktoré sa inak stratili v pošte.
alter table public.quotes
  add column if not exists approval_token text,
  add column if not exists responded_at timestamptz,
  add column if not exists response_note text;

-- Token je jediná ochrana verejnej stránky, takže musí byť jedinečný.
create unique index if not exists quotes_approval_token
  on public.quotes (approval_token)
  where approval_token is not null;
