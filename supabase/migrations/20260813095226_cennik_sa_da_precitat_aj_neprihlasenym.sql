-- Politika „Platform admins manage plans" bola pustená na rolu `public`, čiže aj na
-- neprihláseného návštevníka. Ten na `subscription_plans` nedostal prázdny výsledok,
-- ale chybu `permission denied for function is_platform_admin` — funkciu volá práve
-- táto politika a `anon` na ňu právo nemá. Verejný cenník to obchádzal servisným
-- kľúčom, ale čokoľvek, čo by plány čítalo z prehliadača, by spadlo.
--
-- Správa plánov patrí prihlásenému platformovému adminovi, takže politike stačí rola
-- `authenticated`. Neprihlásenému ostáva čitacia politika „Anyone can read active plans".
alter policy "Platform admins manage plans" on public.subscription_plans to authenticated;
