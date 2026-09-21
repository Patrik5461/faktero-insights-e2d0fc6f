-- Doklady z e-mailu, ktoré nie sú faktúra (exekúcia, predpis, list z úradu),
-- idú medzi ostatné doklady. Zoznam „Doklady e-mailom" musí vedieť, kam.
alter table public.inbox_messages
  add column if not exists created_other_ids uuid[] not null default '{}';
