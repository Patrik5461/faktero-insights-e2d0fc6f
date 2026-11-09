-- Duplicita bločkov (audit 8. 11. 2026): dva skutočné nákupy bez QR od toho
-- istého predajcu v ten istý deň a s rovnakou sumou (dva parkovacie lístky)
-- sa nedali uložiť. Rôzne čísla dokladu už duplicita nie sú a človek môže
-- bloček vedome uložiť „aj tak“ (duplicita_potvrdena).
alter table public.expense_documents
  add column if not exists duplicita_potvrdena boolean not null default false;

comment on column public.expense_documents.duplicita_potvrdena is
  'Človek potvrdil, že bloček s rovnakým dodávateľom, dňom a sumou je iný nákup (duplicita-zauctovania.ts).';

create or replace function public.faktero_najdi_duplicitny_blocek(b public.expense_documents)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  select e.id
  from public.expense_documents e
  where e.company_id = b.company_id
    and e.id <> b.id
    and coalesce(e.status, '') <> 'cancelled'
    and (coalesce(e.total_amount, 0) < 0) = (coalesce(b.total_amount, 0) < 0)
    and (
      case
        when nullif(trim(coalesce(b.qr_raw, '')), '') is not null and nullif(trim(coalesce(e.qr_raw, '')), '') is not null
          then lower(trim(e.qr_raw)) = lower(trim(b.qr_raw))
        else
          -- Vedome uložený „aj tak“ s ničím nekoliduje.
          not coalesce(b.duplicita_potvrdena, false) and not coalesce(e.duplicita_potvrdena, false)
          -- Bez QR na oboch: rôzne čísla dokladu = dva nákupy. S QR na jednom
          -- býva číslo z fotky prečítané inak, preto sa neporovnáva.
          and (
            nullif(trim(coalesce(b.qr_raw, '')), '') is not null
            or nullif(trim(coalesce(e.qr_raw, '')), '') is not null
            or public.faktero_cislo_dokladu_norm(b.document_number) = ''
            or public.faktero_cislo_dokladu_norm(e.document_number) = ''
            or public.faktero_cislo_dokladu_norm(e.document_number) = public.faktero_cislo_dokladu_norm(b.document_number)
          )
          and b.issue_date is not null and e.issue_date = b.issue_date
          and b.total_amount is not null and e.total_amount is not null
          and round(abs(e.total_amount) * 100) = round(abs(b.total_amount) * 100)
          and (
            case
              when public.faktero_ico_norm(b.supplier_ico) <> '' and public.faktero_ico_norm(e.supplier_ico) <> ''
                then public.faktero_ico_norm(e.supplier_ico) = public.faktero_ico_norm(b.supplier_ico)
              else lower(trim(coalesce(b.supplier_name, ''))) <> ''
                and lower(trim(coalesce(e.supplier_name, ''))) = lower(trim(coalesce(b.supplier_name, '')))
            end
          )
      end
    )
  limit 1
$$;

