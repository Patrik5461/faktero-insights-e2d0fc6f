-- Oznam typu info môže mať aj okno (raz pre každého), potom ostane pás s `text`.
alter table public.platformove_oznamy
  add column if not exists nadpis text check (nadpis is null or char_length(nadpis) <= 120),
  add column if not exists text_okno text check (text_okno is null or char_length(text_okno) <= 2000);
comment on column public.platformove_oznamy.nadpis is 'Nadpis okna pri oznamu typu info (inak „Oznam“).';
comment on column public.platformove_oznamy.text_okno is 'Text okna pri oznamu typu info — keď je vyplnený, okno sa každému ukáže raz, potom ostane pás s `text`.';
