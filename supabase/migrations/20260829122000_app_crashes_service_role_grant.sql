-- Zapisovať smie len servisná rola.
--
-- Predchádzajúca migrácia odobrala práva všetkým vrátane servisnej roly —
-- endpoint potom vracal „permission denied for table app_crashes". Tá istá
-- pasca ako pri iných nových tabuľkách: RLS aj politiky môžu sedieť, ale bez
-- GRANT-u sa k tabuľke nedostane nikto.
grant insert on public.app_crashes to service_role;
grant select, delete on public.app_crashes to service_role;
