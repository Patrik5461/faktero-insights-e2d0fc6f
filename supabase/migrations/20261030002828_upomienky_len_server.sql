-- N3 (bezpečnostná kontrola 29. 10.): upomienky zapisuje len server
-- (sendReminder cez service_role). Klient ich nikde nevkladá; priamy INSERT
-- dovolil podvrhnúť `sent_by` aj históriu odoslaných upomienok (stupne sa
-- počítajú z nej). Politika ostáva, ale nepustí nič.
alter policy "Members can insert reminders" on public.invoice_reminders with check (false);
comment on policy "Members can insert reminders" on public.invoice_reminders is
  'Vypnutá 29. 10. 2026 — upomienky vkladá len server (service_role).';
revoke insert, update, delete on public.invoice_reminders from anon, authenticated;
