-- Rozhodnutie 2026-11-02: účtovník má k firme rovnaké práva ako admin (správca).
-- Majiteľa naďalej chráni spúšťač chran_majitela (mení/odoberá ho len majiteľ,
-- firma musí mať aspoň jedného majiteľa) a mazanie firmy ostáva len majiteľovi.

CREATE OR REPLACE FUNCTION public.is_company_admin(_company_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.company_users
    WHERE company_id = _company_id AND user_id = _user_id
      AND role IN ('owner','admin','accountant')
  );
$function$;

-- is_company_writer kedysi znamenala „člen okrem účtovníka“ (vat_reports, vies_checks).
-- Účtovník už nie je obmedzený, takže je to každý člen firmy.
CREATE OR REPLACE FUNCTION public.is_company_writer(_company_id uuid, _user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.company_users cu
     where cu.company_id = _company_id
       and cu.user_id = _user_id
  );
$function$;

comment on function public.is_company_admin(uuid, uuid) is
  'Správca firmy: majiteľ, admin alebo účtovník (od 2026-11-02 má účtovník plné práva).';
comment on function public.is_company_writer(uuid, uuid) is
  'Každý člen firmy (účtovník už nie je obmedzený, 2026-11-02).';
