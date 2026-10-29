-- Upozornenie firme e-mailom, keď jej príde eFaktúra.
-- Prepínač na firme (predvolene zapnutý) a značka odoslania na doklade,
-- aby opakované stiahnutie toho istého dokladu e-mail neposlalo druhýkrát.
alter table public.companies
  add column if not exists efaktura_upozornenie_email boolean not null default true;

comment on column public.companies.efaktura_upozornenie_email is
  'Posielať na e-mail firmy upozornenie na novú prijatú eFaktúru.';

alter table public.efaktura_received_documents
  add column if not exists upozornenie_odoslane_at timestamptz;

comment on column public.efaktura_received_documents.upozornenie_odoslane_at is
  'Kedy odišiel firme e-mail o prijatí (alebo sa rozhodlo, že nepôjde). Zapisuje sa pred odoslaním — chráni pred dvojitým e-mailom.';
