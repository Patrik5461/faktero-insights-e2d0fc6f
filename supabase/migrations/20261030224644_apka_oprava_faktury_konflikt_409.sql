-- Konflikt pri oprave faktúry z appky hlási PT409 (PostgREST → HTTP 409).
-- Pôvodné 40001 (serialization_failure) PostgREST opakoval dokola a volanie
-- skončilo po dvoch minútach 504-kou — appka by „visela" a konflikt nepovedala.
create or replace function public.faktero_oprav_fakturu(
  _invoice_id uuid,
  _ocakavane_updated_at timestamptz,
  _hlavicka jsonb,
  _polozky jsonb
)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  h public.invoices;
  _novy timestamptz;
  _teraz timestamptz;
begin
  h := jsonb_populate_record(null::public.invoices, coalesce(_hlavicka, '{}'::jsonb));

  update public.invoices i set
    issue_date = case when _hlavicka ? 'issue_date' then h.issue_date else i.issue_date end,
    due_date = case when _hlavicka ? 'due_date' then h.due_date else i.due_date end,
    payment_method = case when _hlavicka ? 'payment_method' then h.payment_method else i.payment_method end,
    notes = case when _hlavicka ? 'notes' then h.notes else i.notes end,
    intro_note = case when _hlavicka ? 'intro_note' then h.intro_note else i.intro_note end,
    subtotal = case when _hlavicka ? 'subtotal' then h.subtotal else i.subtotal end,
    vat_total = case when _hlavicka ? 'vat_total' then h.vat_total else i.vat_total end,
    total = case when _hlavicka ? 'total' then h.total else i.total end,
    customer_id = case when _hlavicka ? 'customer_id' then h.customer_id else i.customer_id end,
    customer_name = case when _hlavicka ? 'customer_name' then h.customer_name else i.customer_name end,
    customer_ico = case when _hlavicka ? 'customer_ico' then h.customer_ico else i.customer_ico end,
    customer_dic = case when _hlavicka ? 'customer_dic' then h.customer_dic else i.customer_dic end,
    customer_ic_dph = case when _hlavicka ? 'customer_ic_dph' then h.customer_ic_dph else i.customer_ic_dph end,
    customer_street = case when _hlavicka ? 'customer_street' then h.customer_street else i.customer_street end,
    customer_city = case when _hlavicka ? 'customer_city' then h.customer_city else i.customer_city end,
    customer_zip = case when _hlavicka ? 'customer_zip' then h.customer_zip else i.customer_zip end,
    customer_country = case when _hlavicka ? 'customer_country' then h.customer_country else i.customer_country end,
    customer_email = case when _hlavicka ? 'customer_email' then h.customer_email else i.customer_email end,
    job_id = case when _hlavicka ? 'job_id' then h.job_id else i.job_id end
  where i.id = _invoice_id
    and i.deleted_at is null
    and (_ocakavane_updated_at is null or i.updated_at = _ocakavane_updated_at)
  returning i.updated_at into _novy;

  if not found then
    select i.updated_at into _teraz
    from public.invoices i
    where i.id = _invoice_id and i.deleted_at is null;
    if not found then
      raise exception 'Faktúra už neexistuje alebo na ňu nemáte právo.'
        using errcode = 'P0002';
    end if;
    if _ocakavane_updated_at is not null and _teraz is distinct from _ocakavane_updated_at then
      raise exception 'Faktúru medzitým zmenil niekto iný. Načítajte ju znova a opravu zopakujte.'
        using errcode = 'PT409', hint = 'faktura_zmenena';
    end if;
    raise exception 'Na opravu tejto faktúry nemáte právo.' using errcode = '42501';
  end if;

  if _polozky is not null then
    delete from public.invoice_items where invoice_id = _invoice_id;
    insert into public.invoice_items (
      invoice_id, position, name, description, quantity, unit, unit_price, vat_rate,
      product_id, stock_item_id, subtotal, vat_amount, total
    )
    select
      _invoice_id, coalesce(p.position, 0), p.name, p.description, coalesce(p.quantity, 1),
      coalesce(p.unit, 'ks'), coalesce(p.unit_price, 0), coalesce(p.vat_rate, 0),
      p.product_id, p.stock_item_id, coalesce(p.subtotal, 0), coalesce(p.vat_amount, 0),
      coalesce(p.total, 0)
    from jsonb_populate_recordset(null::public.invoice_items, _polozky) p;
  end if;

  return _novy;
end;
$$;

revoke all on function public.faktero_oprav_fakturu(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.faktero_oprav_fakturu(uuid, timestamptz, jsonb, jsonb) to authenticated, service_role;
