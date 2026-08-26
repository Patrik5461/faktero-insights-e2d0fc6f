-- Verejný odkaz na faktúru pre QR kód na doklade.
--
-- Odberateľ naskenuje QR a otvorí sa mu faktúra — bez prihlásenia, lebo doklad
-- už aj tak drží v ruke. Token je náhodný a neuhádnuteľný; sprístupňuje výhradne
-- ten jeden doklad. Zapisuje sa až pri prvom vygenerovaní PDF, staré faktúry
-- teda odkaz nedostanú spätne (a nemajú ho ani na vytlačenom papieri).
alter table public.invoices add column if not exists public_token text;

create unique index if not exists invoices_public_token_key
  on public.invoices (public_token)
  where public_token is not null;
