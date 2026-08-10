-- Bloček z eKasy chodí aj s položkami a s rozpisom DPH po sadzbách. Doteraz
-- nebolo kam ich uložiť, takže sa zahodili a z dokladu ostala len celková suma.
alter table public.expense_documents
  add column if not exists items jsonb,
  add column if not exists vat_breakdown jsonb;

comment on column public.expense_documents.items is
  'Položky dokladu tak, ako ich vydala Finančná správa alebo prečítalo OCR.';
comment on column public.expense_documents.vat_breakdown is
  'Rozpis základu a DPH po sadzbách; bloček ich má často viac naraz.';
