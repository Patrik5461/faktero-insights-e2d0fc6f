drop trigger if exists bank_transactions_webhook_novy on public.bank_transactions;
create trigger bank_transactions_webhook_novy after insert on public.bank_transactions
  for each row execute function public.webhook_bankovy_pohyb();
