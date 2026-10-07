alter table public.companies add column if not exists pohoda_clenenie_dph_prijata_pdp text;
comment on column public.companies.pohoda_clenenie_dph_prijata_pdp is 'Členenie DPH Pohody pre prijaté plnenie v prenesení daňovej povinnosti (§ 69 ods. 12)';
