-- Pridaním parametra vznikla druhá verzia funkcie; stará dvojparametrová by
-- ďalej rozdávala čísla zo spoločnej rady. Nová má default, takže volania
-- s dvoma argumentmi trafia ju.
drop function if exists public.faktero_next_invoice_number(uuid, date);

-- Nová funkcia sa vytvorila s prednastavenými právami, kde EXECUTE drží PUBLIC.
revoke all on function public.faktero_next_invoice_number(uuid, date, text) from public;
grant execute on function public.faktero_next_invoice_number(uuid, date, text) to authenticated;
grant execute on function public.faktero_next_invoice_number(uuid, date, text) to service_role;
