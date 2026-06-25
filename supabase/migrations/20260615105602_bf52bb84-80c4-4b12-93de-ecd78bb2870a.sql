GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_levels TO authenticated;
GRANT ALL ON public.stock_levels TO service_role;

GRANT SELECT, INSERT, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;