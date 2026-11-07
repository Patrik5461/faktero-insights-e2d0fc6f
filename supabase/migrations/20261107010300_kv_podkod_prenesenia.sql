-- KV A.2 s podkódom podľa písmena § 69 ods. 12 (A2SP, A2CN, A2MT, A2IO).
--
-- Číselník KV Pohody všeobecné „A2“ nemá; automatika (`resolveVatClassification`)
-- ho teraz určuje z druhu prenesenia (`invoices.pdp_druh`), inak z colných kódov
-- položiek. Zmena druhu prenesenia preto musí vrátiť doklad do fronty
-- automatického členenia — pridáva sa do sledovaných stĺpcov strážcu.
--
-- Len súbor — aplikuje sa spolu s nasadením (faktero-migracie-verzie-nesedia).

drop trigger if exists invoices_clenenie_auto on public.invoices;
create trigger invoices_clenenie_auto
  before update on public.invoices
  for each row execute function public.faktero_clenenie_vystavenej_strazca(
    'type', 'company_id', 'customer_ico', 'customer_name', 'customer_dic', 'customer_ic_dph',
    'customer_country', 'vat_total', 'reverse_charge', 'reverse_charge_type', 'eu_plnenie',
    'osobitna_uprava', 'oss_country', 'opravuje_fakturu_id', 'pravidlo_id', 'deleted_at',
    'pdp_druh'
  );

-- Neodovzdané doklady so všeobecným A2 / C1 v prenesení prejdú automatikou znova
-- (automatické hodnoty dostanú podkód, ak sa písmeno dá určiť; ručné ostávajú).
update public.invoices
   set clenenie_auto_at = null
 where exported_at is null
   and deleted_at is null
   and reverse_charge
   and upper(coalesce(kv_clenenie, '')) in ('A2', 'C1')
   and coalesce(kv_zdroj, 'auto') = 'auto';
