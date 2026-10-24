drop trigger if exists invoices_webhook_uhradena on public.invoices;
create trigger invoices_webhook_uhradena after update of status on public.invoices
  for each row execute function public.webhook_faktura_uhradena();
