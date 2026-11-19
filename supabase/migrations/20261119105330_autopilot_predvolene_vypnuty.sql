-- Automatické zaúčtovanie je od 19. 11. 2026 predvolene vypnuté.
-- Návrhy (pravidlo → zvyk → AI) sa pripravujú ďalej, len sa samé nepotvrdia.
-- Firmy s „plny“ (zapol ich človek) ostávajú; „bezpecny“ bol len predvolený.
alter table public.companies alter column auto_uctovanie_rezim set default 'vypnuty';

update public.companies
   set auto_uctovanie_rezim = 'vypnuty'
 where auto_uctovanie_rezim = 'bezpecny';
