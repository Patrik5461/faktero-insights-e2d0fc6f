-- Súhlas, s ktorým sťahovanie pohybov zlyhalo na vypršaní (SCA_EXPIRED, CONSENT_*).
-- Kým pripojenie má ten istý consent_id, synchronizácia účet neskúša znova
-- (banka by vrátila tú istú chybu 24–40× denne); po obnovení súhlasu sa id zmení.
alter table public.bank_accounts add column if not exists pohyby_chyba_suhlas text;
