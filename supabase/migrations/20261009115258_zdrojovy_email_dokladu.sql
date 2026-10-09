-- Zdrojový e-mail (ako v Doklado): text mailu, s ktorým doklad prišiel, a väzba dokladu naň.
alter table public.inbox_messages
  add column if not exists text_mailu text,
  add column if not exists to_email text;
comment on column public.inbox_messages.text_mailu is
  'Text prijatého mailu (najviac 20 000 znakov) — ukazuje sa pri doklade ako „Zdrojový e-mail".';

alter table public.purchase_invoices add column if not exists inbox_message_id uuid
  references public.inbox_messages(id) on delete set null;
alter table public.expense_documents add column if not exists inbox_message_id uuid
  references public.inbox_messages(id) on delete set null;
alter table public.other_documents add column if not exists inbox_message_id uuid
  references public.inbox_messages(id) on delete set null;
