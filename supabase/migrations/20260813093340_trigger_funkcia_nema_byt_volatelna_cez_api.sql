-- `faktero_invalidate_invoice_pdf()` je trigger funkcia — cez REST ju zavolať netreba
-- a ani nemá zmysel. Právo držalo PUBLIC, takže ho odoberáme tam, nielen rolám;
-- odobrať iba `anon` by nespravilo nič (viď rovnaká pasca pri RPC).
-- Overené: trigger sa po odobratí ďalej spúšťa (update 62 faktúr pod rolou
-- `authenticated` prešiel) — právo sa kontroluje pri vytváraní triggera, nie pri behu.
revoke all on function public.faktero_invalidate_invoice_pdf() from public;
revoke all on function public.faktero_invalidate_invoice_pdf() from anon;
revoke all on function public.faktero_invalidate_invoice_pdf() from authenticated;
