-- Pomocné funkcie generátora čísel bežia s právami vlastníka a členstvo samy
-- nekontrolujú — spoliehajú sa na generátor (`faktero_next_invoice_number`,
-- `faktero_next_series_number`), ktorý to urobí pred nimi. Volateľné zvonku
-- však boli: `faktero_rad_pre_druh` dokázal cudzej firme založiť číselný rad
-- a `faktero_predvolena_sablona` prezradil jej formát čísel.
--
-- Aplikácia ich priamo nevolá. Generátor je SECURITY DEFINER s tým istým
-- vlastníkom, takže ich po odobratí práva volá ďalej.
--
-- Právo drží PUBLIC, nie anon — samotné `revoke from anon` by nič nezmenilo.
revoke all on function public.faktero_rad_pre_druh(uuid, text) from public, anon, authenticated;
revoke all on function public.faktero_predvolena_sablona(uuid, text) from public, anon, authenticated;
grant execute on function public.faktero_rad_pre_druh(uuid, text) to service_role;
grant execute on function public.faktero_predvolena_sablona(uuid, text) to service_role;

-- Spúšťač z modulu Zamestnanci ostal volateľný aj neprihláseným. Ako RPC by
-- spadol, ale štandard projektu je, že spúšťače cez rozhranie nevisia.
revoke all on function public.employees_touch_updated_at() from public, anon, authenticated;
