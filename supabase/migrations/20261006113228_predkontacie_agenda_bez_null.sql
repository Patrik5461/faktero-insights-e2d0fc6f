-- Upsert cez PostgREST potrebuje obyčajný unikátny index (výraz ani čiastočný
-- index pri inferencii nepoužije) — agenda je preto '' namiesto NULL.
update public.predkontacie set agenda = '' where agenda is null;
alter table public.predkontacie alter column agenda set default '';
alter table public.predkontacie alter column agenda set not null;
drop index if exists public.predkontacie_kluc;
create unique index if not exists predkontacie_kluc
  on public.predkontacie (company_id, druh, kod, agenda);
