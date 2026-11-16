-- Nespracované doklady: druh „vydana“ (vlastná vystavená faktúra — priradí sa
-- k vystavenej faktúre alebo z nej vznikne) a „danovy“ (daňový doklad
-- k prijatej platbe), ktorý v kontrole chýbal — uloženie takého druhu
-- (aj návrh druhu pri vyťažení) databáza odmietala.
alter table public.nespracovane_doklady drop constraint if exists nespracovane_doklady_druh_check;
alter table public.nespracovane_doklady add constraint nespracovane_doklady_druh_check
  check (druh in ('faktura', 'zalohova', 'danovy', 'dobropis', 'blocek', 'ostatny', 'vydana'));
