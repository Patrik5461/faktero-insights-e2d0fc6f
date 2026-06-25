
CREATE OR REPLACE FUNCTION public.create_company_with_owner(
  _name text,
  _ico text DEFAULT NULL,
  _dic text DEFAULT NULL,
  _ic_dph text DEFAULT NULL,
  _street text DEFAULT NULL,
  _city text DEFAULT NULL,
  _zip text DEFAULT NULL,
  _country text DEFAULT 'SK',
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _iban text DEFAULT NULL,
  _default_currency text DEFAULT 'EUR'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;

  INSERT INTO public.companies (
    name, ico, dic, ic_dph, street, city, zip, country, email, phone, iban, default_currency, created_by
  ) VALUES (
    btrim(_name), NULLIF(_ico,''), NULLIF(_dic,''), NULLIF(_ic_dph,''),
    NULLIF(_street,''), NULLIF(_city,''), NULLIF(_zip,''), COALESCE(NULLIF(_country,''),'SK'),
    NULLIF(_email,''), NULLIF(_phone,''), NULLIF(_iban,''),
    COALESCE(NULLIF(_default_currency,''),'EUR'),
    _uid
  )
  RETURNING id INTO _company_id;

  INSERT INTO public.company_users (company_id, user_id, role)
  VALUES (_company_id, _uid, 'owner');

  RETURN _company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_company_with_owner(
  text, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;
