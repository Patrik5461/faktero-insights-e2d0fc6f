-- Poistka: stará trojparametrová verzia sa ruší aj vlastnou migráciou,
-- aby sa pri prehrávaní histórie na čistej databáze nikde nezachovala.
drop function if exists public.faktero_next_invoice_number(uuid, date, text);
