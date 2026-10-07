-- Ťarchopis len zvyšuje cenu už dodaného tovaru — sklad sa ním nehýbe.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.trg_invoice_stock_sync()'::regprocedure);
  if position('debit_note' in d) = 0 then
    d := replace(d, $r$  IF COALESCE(NEW.deferred_stock_issue, false) THEN RETURN NEW; END IF;$r$,
      $r$  IF COALESCE(NEW.deferred_stock_issue, false) THEN RETURN NEW; END IF;
  IF NEW.type::text = 'debit_note' THEN RETURN NEW; END IF;$r$);
    execute d;
  end if;
end $$;
