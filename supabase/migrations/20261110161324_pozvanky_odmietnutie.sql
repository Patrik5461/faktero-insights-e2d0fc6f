-- Pozvánku do firmy možno odmietnuť priamo vo webe (zvonček / pás hore).
-- Odmietnutá ostáva v zozname pozvánok firmy, aby pozývajúci videl, čo sa stalo.
alter table public.company_invitations
  add column if not exists declined_at timestamptz;
