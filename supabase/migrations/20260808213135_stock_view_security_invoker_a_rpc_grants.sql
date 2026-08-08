-- 1) Pohľad stock_items_with_availability bežal s právami vlastníka, takže
-- obchádzal RLS na stock_items. Prihlásený používateľ z ktorejkoľvek firmy
-- si cez neho vedel prečítať skladové karty všetkých ostatných firiem vrátane
-- nákupných cien, dodávateľov a umiestnenia. Pohľad sám žiadny filter na
-- company_id nemá — spoliehal sa výhradne na RLS, ktoré nebolo v hre.
-- So security_invoker platia politiky volajúceho, čiže to isté, čo pri
-- priamom čítaní stock_items.
alter view public.stock_items_with_availability set (security_invoker = on);

-- 2) Funkcie SECURITY DEFINER boli spustiteľné aj neprihláseným návštevníkom
-- cez /rest/v1/rpc/*. Dve z nich menia dáta.
-- POZOR: tieto revoke príkazy samy o sebe nestačia, právo drží PUBLIC —
-- dorieši to nasledujúca migrácia 20260808213213_rpc_revoke_from_public.sql.
revoke execute on function public.expire_stale_reservations() from anon, authenticated;
revoke execute on function public.recompute_stock_avg_cost(uuid) from anon;

-- Volané výhradne zo servera cez service_role.
revoke execute on function public.faktero_invoice_pdf_hash(uuid) from anon, authenticated;
revoke execute on function public.faktero_can_write(uuid, text) from anon, authenticated;

-- Spúšťacie funkcie nemá volať nikto priamo; triggery bežia mimo týchto práv.
revoke execute on function public.faktero_invalidate_invoice_pdf_from_item() from anon, authenticated;
revoke execute on function public.trg_quote_reservations_sync() from anon, authenticated;
revoke execute on function public.trg_stock_movement_cost_snapshot() from anon, authenticated;
revoke execute on function public.trg_stock_movement_recalc_avg() from anon, authenticated;
