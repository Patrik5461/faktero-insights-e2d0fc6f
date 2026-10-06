-- Účtovanie pomerom ako vlastnosť predkontácie (ako v Doklado):
-- {"typ":"pomer","casti":[{"podiel":80,"predkontacia":"1Fp","odpocet":true},…],"clenenieBezOdpoctu":"PN"}
-- {"typ":"dph5050","zaklad":80,"zdanitelna":"A","lenZaklad":"B","nezdanitelna":"C","clenenieBezOdpoctu":"PN"}
alter table public.predkontacie add column if not exists pomer jsonb;
