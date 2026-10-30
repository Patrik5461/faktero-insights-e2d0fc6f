-- Platnosť ponuky: 30 dní od dneška podľa Bratislavy (doplnok k predvolene_datumy_podla_bratislavy).
alter table public.quotes alter column valid_until set default ((now() at time zone 'Europe/Bratislava')::date + 30);
