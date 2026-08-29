-- Okrem pádov sa do tej istej tabuľky hlási aj samotný štart appky.
--
-- Bez toho sa nedá odlíšiť „appka sa ani nespustila" od „appka beží, len
-- padá inde" — a ani to, ktorý balíček má človek v telefóne nainštalovaný.
-- Hlási sa len zo skúšobných (debuggable) buildov, nie z tých z obchodu.
alter table public.app_crashes add column if not exists typ text not null default 'pad';

comment on column public.app_crashes.typ is 'pad = výpis pádu, start = appka sa spustila';
