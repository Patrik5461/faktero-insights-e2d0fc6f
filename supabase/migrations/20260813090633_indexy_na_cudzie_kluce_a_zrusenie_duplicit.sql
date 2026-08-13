-- Cudzie kľúče bez indexu: každé mazanie rodiča a každý join cez ne skenuje celú tabuľku.
create index if not exists idx_bank_payments_bank_connection_id on public.bank_payments (bank_connection_id);
create index if not exists idx_customers_default_job_id on public.customers (default_job_id);
create index if not exists idx_price_action_products_product_id on public.price_action_products (product_id);
create index if not exists idx_product_prices_price_group_id on public.product_prices (price_group_id);
create index if not exists idx_purchase_orders_warehouse_id on public.purchase_orders (warehouse_id);
create index if not exists idx_sales_order_items_product_id on public.sales_order_items (product_id);
create index if not exists idx_sales_order_items_stock_item_id on public.sales_order_items (stock_item_id);
create index if not exists idx_sales_orders_quote_id on public.sales_orders (quote_id);

-- Dva páry identických indexov. Z každého páru necháme ten, ktorý drží obmedzenie
-- (subscriptions) alebo na ktorý sa odvoláva kód (trips).
drop index if exists public.subscriptions_company_id_unique;
drop index if exists public.trips_company_external_unique;
