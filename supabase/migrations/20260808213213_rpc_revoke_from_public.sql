-- Predchádzajúci revoke bol zbytočný: tieto funkcie nemali práva pridelené
-- rolám anon/authenticated, ale zdedené cez PUBLIC (v ACL vidno `=X/postgres`).
-- Postgres dáva EXECUTE roli PUBLIC pri každej novej funkcii automaticky, takže
-- `revoke ... from anon` neurobí nič a funkcia ostane volateľná cez
-- /rest/v1/rpc/* aj bez prihlásenia. Odobrať sa musí PUBLIC a potom vrátiť
-- právo len tomu, kto ho naozaj potrebuje.

revoke execute on function public.expire_stale_reservations() from public;
grant execute on function public.expire_stale_reservations() to service_role;

revoke execute on function public.recompute_stock_avg_cost(uuid) from public;
grant execute on function public.recompute_stock_avg_cost(uuid) to authenticated, service_role;

revoke execute on function public.faktero_invoice_pdf_hash(uuid) from public;
grant execute on function public.faktero_invoice_pdf_hash(uuid) to service_role;

revoke execute on function public.faktero_invalidate_invoice_pdf_from_item() from public;
revoke execute on function public.trg_quote_reservations_sync() from public;
revoke execute on function public.trg_stock_movement_cost_snapshot() from public;
revoke execute on function public.trg_stock_movement_recalc_avg() from public;
