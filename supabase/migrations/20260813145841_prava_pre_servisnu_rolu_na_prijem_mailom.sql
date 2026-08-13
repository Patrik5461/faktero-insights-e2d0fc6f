-- Nová tabuľka v tomto projekte nedostane práva sama — server píše cez servisnú rolu
-- a bez tohto grantu skončí na „permission denied for table".
grant all on public.inbox_addresses to service_role;
grant all on public.inbox_messages to service_role;
