-- Dobropis vie, ktorú faktúru opravuje.
--
-- Doteraz to bola len faktúra s typom `credit_note` a väzba na pôvodný doklad
-- žila nanajvýš v poznámke. Pohoda vie dobropis naviazať na pôvodnú faktúru
-- (`correctiveDocument`), ale potrebuje vedieť, ktorú — bez tohto stĺpca sa to
-- nedá zistiť inak než hádaním z variabilného symbolu.

alter table public.invoices
  add column if not exists opravuje_fakturu_id uuid references public.invoices(id) on delete set null;

comment on column public.invoices.opravuje_fakturu_id is
  'Ktorú faktúru tento dobropis opravuje. Používa sa pri väzbe v účtovnom programe.';

create index if not exists invoices_opravuje_fakturu_idx
  on public.invoices (opravuje_fakturu_id)
  where opravuje_fakturu_id is not null;

-- Storno už odovzdanej faktúry je samostatná položka dávky, preto má aj vlastnú
-- evidenciu odoslania.
alter table public.pohoda_odoslane drop constraint if exists pohoda_odoslane_agenda_check;
alter table public.pohoda_odoslane
  add constraint pohoda_odoslane_agenda_check
  check (agenda in ('adresar', 'sklad', 'zakazka', 'pohyb', 'storno'));
