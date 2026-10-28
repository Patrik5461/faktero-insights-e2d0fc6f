-- Vlastný stav, štítky a komentár na PDF faktúry nie sú — ich zmena nesmie zahodiť hotové PDF.
create or replace function public.faktero_invalidate_invoice_pdf()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if (to_jsonb(new) - 'pdf_url' - 'pdf_source_hash' - 'updated_at' - 'stav_id' - 'komentar' - 'stitky')
     is distinct from
     (to_jsonb(old) - 'pdf_url' - 'pdf_source_hash' - 'updated_at' - 'stav_id' - 'komentar' - 'stitky')
  then
    new.pdf_url := null;
    new.pdf_source_hash := null;
  end if;
  return new;
end
$function$;
