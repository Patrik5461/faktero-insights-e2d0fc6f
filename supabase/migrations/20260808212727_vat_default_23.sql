-- Základná sadzba DPH je od 1. 1. 2025 dvadsaťtri percent (§ 27 zákona č. 222/2004 Z. z.).
-- Stĺpce si niesli default 20 z pôvodnej schémy. Formuláre aj API posielajú
-- sadzbu vždy výslovne, takže to zatiaľ nikoho nepopálilo, ale každý zápis,
-- ktorý stĺpec vynechá (hromadný import, ručné SQL), by ticho dostal starú sadzbu.
-- Existujúce riadky sa zámerne nemenia — 20 % na starých dokladoch je správne.
alter table invoice_items alter column vat_rate set default 23;
alter table quote_items   alter column vat_rate set default 23;
alter table products      alter column vat_rate set default 23;
alter table stock_items   alter column vat_rate set default 23;
