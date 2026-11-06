-- B1-1: systémový číselník členenia DPH a KV DPH pre každú slovenskú firmu
-- a automatické predvyplnenie členenia na prijatých faktúrach a bločkoch.
--
-- Prečo riadky firmy (seed) a nie spoločné riadky s company_id NULL:
--  * unikátny kľúč (company_id, druh, kod, agenda) ostáva — NULL by ho obišiel
--    (NULL sa v unikátnom indexe neporovnáva) a upsert z Pohody/obrázka by
--    nemal na čo naraziť,
--  * RLS (is_company_member, firmy_s_pravom, mfa) a ~25 dotazov
--    `.eq('company_id', …)` fungujú bez zmeny — riadky bez firmy by žiadna
--    politika ani dotaz nevidel,
--  * skrytie pre jednu firmu = `aktivne = false` na jej riadku (žiadna ďalšia
--    tabuľka výnimiek), zámok dokladov ani exporty číselník nečítajú.
-- Systémové riadky majú zdroj 'system': človek ich nezmaže (len vypne) a nezmení
-- im kód; import z Pohody / obrázka ich len doplní (popis, aktívnosť).
--
-- Kódy: src/lib/faktero/predkontacie-systemove.ts (test drží zhodu s touto
-- migráciou). Agenda členenia DPH = riadok priznania z Pohody („1200 U01“) —
-- ten istý, aký Pohoda vráti pri načítaní číselníka, takže import z Pohody
-- systémový riadok nájde a nezdvojí ho.
--
-- Len súbor — aplikuje sa pri nasadení (cez MCP apply_migration, súbor
-- premenovať na zapísanú verziu). Idempotentné.

/* ------------------------------------------------ 1) zdroj 'system' */

alter table public.predkontacie drop constraint if exists predkontacie_zdroj_check;
alter table public.predkontacie add constraint predkontacie_zdroj_check
  check (zdroj = any (array['rucne', 'pohoda', 'subor', 'obrazok', 'system']));

/* ------------------------------------------------ 2) zoznam kódov */

create or replace function public.predkontacie_systemove_zoznam()
 returns table (druh text, kod text, popis text, agenda text, typ_dokladu text, kategoria text)
 language sql
 immutable
 set search_path to 'public'
as $function$
  values
    ('clenenie_dph', 'UN', 'Nezahrňovať do priznania DPH', '5 U', 'vydane', null),
    ('clenenie_dph', 'PN', 'Nezahrňovať do priznania DPH', '103 P', 'prijate', null),
    ('clenenie_dph', 'UD', 'Tuzemské plnenie', '1200 U01', 'vydane', null),
    ('clenenie_dph', 'UK', 'Tuzemské plnenia - nezapočítať do koeficientu', '1201 U02', 'vydane', null),
    ('clenenie_dph', 'UDzasEUl', 'Zaslanie tovaru do iného štátu EU - do limitu', '1202 U03', 'vydane', null),
    ('clenenie_dph', 'UDdodEU', 'Dodanie tovaru do iného štátu EU', '1203 U04', 'vydane', null),
    ('clenenie_dph', 'UKdodEU', 'Dodanie tovaru do iného štátu EU - nezapočítať do koeficientu', '1204 U05', 'vydane', null),
    ('clenenie_dph', 'UDdod3', 'Dodanie tovaru druhým podnikateľom pri trojstrannom obchode', '1206 U07', 'vydane', null),
    ('clenenie_dph', 'UNodpS', 'Oslobodené plnenia s možnosťou odpoč. dane', '1207 U08', 'vydane', null),
    ('clenenie_dph', 'UKodpS', 'Oslobodené plnenia s možnosťou odpoč. dane - nezapočítať do koeficientu', '1208 U09', 'vydane', null),
    ('clenenie_dph', 'UNodpBez', 'Oslobodené plnenia bez možnosti odpočítania dane', '1209 U10', 'vydane', null),
    ('clenenie_dph', 'UKodpBez', 'Oslobodené plnenia bez možnosti odpočítania dane - nezapočítať do koeficientu', '1210 U11', 'vydane', null),
    ('clenenie_dph', 'UDzahr', 'Miesto plnenia v zahraničí s možnosťou odpočítania dane', '1211 U12', 'vydane', null),
    ('clenenie_dph', 'UKzahr', 'Miesto plnenia v zahraničí s možnosťou odpočítania dane - nezapočítať do koeficientu', '1212 U13', 'vydane', null),
    ('clenenie_dph', 'UDcest', 'Osobitná úprava pre cestovné služby', '1213 U14', 'vydane', null),
    ('clenenie_dph', 'UKcest', 'Osobitná úprava pre cestovné služby - nezapočítať do koeficientu', '1214 U15', 'vydane', null),
    ('clenenie_dph', 'UDobch', 'Osobitná úprava pre obchody s použ. tovarom a umením', '1215 U16', 'vydane', null),
    ('clenenie_dph', 'UKobch', 'Osobitná úprava pre obchody s použ. tovarom a umením - nezapočítať do koeficientu', '1216 U17', 'vydane', null),
    ('clenenie_dph', 'UVdaň', 'Vrátená daň', '1217 U18', 'vydane', null),
    ('clenenie_dph', 'URozdiel', 'Rozdiel v základe dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11)', '1218 U19', 'vydane', null),
    ('clenenie_dph', 'UZinýEU', 'Zaslanie tovaru z iného štátu EU s plnením v tuzemsku', '1219 U20', 'vydane', null),
    ('clenenie_dph', 'UN§69', 'Prenesenie daňovej povinnosti §69 ods. 12', '1220 U21', 'vydane', null),
    ('clenenie_dph', 'UDzahrSl', 'Miesto plnenia v zahraničí s možnosťou odpočítania dane', '1221 U22', 'vydane', null),
    ('clenenie_dph', 'UKzahrSl', 'Miesto plnenia v zahraničí s možnosťou odpočítania dane - nezapočítať do koeficientu', '1222 U23', 'vydane', null),
    ('clenenie_dph', 'UDdopr11', 'Dodanie nového dopravného prostriedku', '1223 U24', 'vydane', null),
    ('clenenie_dph', 'UKrozdiel', 'Rozdiel v zákl. dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11) - nezapočítať do koef.', '1224 U25', 'vydane', null),
    ('clenenie_dph', 'URoz§25a', 'Rozdiel v základe dane a v dani po oprave (§25a)', '1225 U26', 'vydane', null),
    ('clenenie_dph', 'UKroz§25a', 'Rozdiel v základe dane a v dani po oprave (§25a) - nezapočítať do koeficientu', '1226 U27', 'vydane', null),
    ('clenenie_dph', 'UNoslob', 'Oslobodené plnenia §65 ods. 7 a §67 ods.3', '1228 U29', 'vydane', null),
    ('clenenie_dph', 'UD-OsU', 'Tuzemské plnenia - osobitná úprava §68d', '1229 U30', 'vydane', null),
    ('clenenie_dph', 'UK-OsU', 'Tuzemské plnenia - osobitná úprava §68d - nezapočítať do koeficientu', '1230 U31', 'vydane', null),
    ('clenenie_dph', 'Uroz-OsU', 'Rozdiel v základe dane a v dani po oprave (§25 ods. 1 až 3, §65 ods. 10 a 11) - os. úprava §68d', '1231 U32', 'vydane', null),
    ('clenenie_dph', 'UKroz-OsU', 'Rozdiel v zákl.dane a v dani po opr.(§25 ods.1 až 3, §65 ods.10 a 11)-os. úpr. §68d-nezap. do koef.', '1232 U33', 'vydane', null),
    ('clenenie_dph', 'UNodpBez-OsU', 'Oslobodené plnenia bez možnosti odpočítania dane – osobitná úprava §68d', '1233 U34', 'vydane', null),
    ('clenenie_dph', 'UKodpBez-OsU', 'Oslobodené plnenia bez možnosti odpočítania dane - nezapočítať do koeficientu – osobitná úprava §68d', '1234 U35', 'vydane', null),
    ('clenenie_dph', 'UDpdp', 'Prenesenie daňovej povinnosti §69 ods. 12 (s uvedením sadzby dane)', '1235 U36', 'vydane', null),
    ('clenenie_dph', 'UKpdp', 'Prenesenie daňovej povinnosti §69 ods. 12 (s uvedením sadzby dane) - nezapočítať do koeficientu', '1236 U37', 'vydane', null),
    ('clenenie_dph', 'UDzrušReg', 'Zrušenie registrácie platiteľa', '1237 U38', 'vydane', null),
    ('clenenie_dph', 'PD', 'Tuzemské plnenie s nárokom na odpočet', '1300 P01', 'prijate', null),
    ('clenenie_dph', 'PK', 'Tuzemské plnenia - krátiť nárok', '1301 P02', 'prijate', null),
    ('clenenie_dph', 'PB', 'Tuzemské plnenia - bez nároku', '1302 P03', 'prijate', null),
    ('clenenie_dph', 'PDnadEU', 'Nadobudnutie tovaru z iného štátu EU', '1303 P04', 'prijate', null),
    ('clenenie_dph', 'PKnadEU', 'Nadobudnutie tovaru z iného štátu EU - krátiť nárok', '1304 P05', 'prijate', null),
    ('clenenie_dph', 'PBnadEU', 'Nadobudnutie tovaru z iného štátu EU - bez nároku', '1305 P06', 'prijate', null),
    ('clenenie_dph', 'PDsluz', 'Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca', '1306 P07', 'prijate', null),
    ('clenenie_dph', 'PKsluz', 'Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca - krátiť nárok', '1307 P08', 'prijate', null),
    ('clenenie_dph', 'PBsluz', 'Poskytnutie služieb a tovarov, pri ktorých daň platí príjemca - bez nároku', '1308 P09', 'prijate', null),
    ('clenenie_dph', 'PDtovar', 'Dovoz tovaru', '1309 P10', 'prijate', null),
    ('clenenie_dph', 'PKtovar', 'Dovoz tovaru - krátiť nárok', '1310 P11', 'prijate', null),
    ('clenenie_dph', 'PBtovar', 'Dovoz tovaru - bez nároku', '1311 P12', 'prijate', null),
    ('clenenie_dph', 'PD1odb', 'Nadobudnutie tovaru prvým odberateľom', '1312 P13', 'prijate', null),
    ('clenenie_dph', 'PDdopr', 'Nadobudnutie nového dopravného prostriedku', '1313 P14', 'prijate', null),
    ('clenenie_dph', 'PDoprava', 'Oprava odpočítanej dane', '1314 P15', 'prijate', null),
    ('clenenie_dph', 'PVdaň', 'Vrátená daň', '1315 P16', 'prijate', null),
    ('clenenie_dph', 'PKoprava', 'Oprava odpočítanej dane (§ 53) - krátiť nárok', '1317 P18', 'prijate', null),
    ('clenenie_dph', 'PD-OsU', 'Tuzemské plnenia - osobitná úprava §68d', '1318 P19', 'prijate', null),
    ('clenenie_dph', 'PK-OsU', 'Tuzemské plnenia - osobitná úprava §68d - krátiť nárok', '1319 P20', 'prijate', null),
    ('clenenie_dph', 'PDopr-OsU', 'Oprava odpočítanej dane - osobitná úprava §68d', '1320 P21', 'prijate', null),
    ('clenenie_dph', 'PKopr-OsU', 'Oprava odpočítanej dane - osobitná úprava §68d - krátiť nárok', '1321 P22', 'prijate', null),
    ('clenenie_dph', 'PD-OsUdod', 'Tuzemské plnenia - faktúra vystavená v osobitnej úprave §68d', '1322 P23', 'prijate', null),
    ('clenenie_dph', 'PK-OsUdod', 'Tuzemské plnenia - faktúra vystavená v osobitnej úprave §68d - krátiť nárok', '1323 P24', 'prijate', null),
    ('clenenie_dph', 'PDopr-OsUdod', 'Oprava odpočítanej dane - faktúra vystavená v osobitnej úprave §68d', '1324 P25', 'prijate', null),
    ('clenenie_dph', 'PKopr-OsUdod', 'Oprava odpočítanej dane - faktúra vystavená v osobitnej úprave §68d - krátiť nárok', '1325 P26', 'prijate', null),
    ('clenenie_dph', 'PDopr§53b', 'Oprava odpočítanej dane (§53b)', '1326 P27', 'prijate', null),
    ('clenenie_dph', 'PKopr§53b', 'Oprava odpočítanej dane (§53b) – krátiť nárok', '1327 P28', 'prijate', null),
    ('clenenie_dph', 'PNnevymer', 'Nezahrňovať do priznania DPH - nevymeriavať DPH', '1328 P', 'prijate', null),
    ('clenenie_dph', 'PDtov§84a', 'Dovoz tovaru (daň uplatnená podľa § 84a ods. 3)', '1329 P29', 'prijate', null),
    ('clenenie_dph', 'PKtov§84a', 'Dovoz tovaru (daň uplatnená podľa § 84a ods. 3) - krátiť nárok', '1330 P30', 'prijate', null),
    ('clenenie_dph', 'DDnadEU', 'Nadobudnutie tovaru z iného štátu EU', '1350 D01', 'prijate', null),
    ('clenenie_dph', 'DDsluz', 'Tovary a služby, pri ktorých daň platí príjemca', '1351 D02', 'prijate', null),
    ('clenenie_dph', 'DDdopr', 'Nadobudnutie nového dopravného prostriedku', '1352 D03', 'prijate', null),
    ('clenenie_dph', 'DD2odb', 'Tovary, pri ktorých daň platí druhý odberateľ', '1353 D04', 'prijate', null),
    ('clenenie_dph', 'DDsl§69', 'Služby, pri ktorých príjemca platí daň podľa § 69 ods.3 zákona', '1354 D05', 'prijate', null),
    ('clenenie_dph', 'DRozdiel', 'Rozdiel v zákl. dane a v dani po oprave (§25 od.1 až 3) - tovary a služby (D01 - D05)', '1355 D06', 'prijate', null),
    ('clenenie_dph', 'DDtov§84a', 'Dovoz tovaru § 84a ods. 3', '1356 D07', 'prijate', null),
    ('kv_clenenie', 'A1', 'Vyhotovené faktúry, pri ktorých je platiteľ osobou povinnou platiť daň, vyhotovenie faktúry §71-§75', '', 'vydane', 'A1 Dodanie - Vydané faktúry'),
    ('kv_clenenie', 'A2CN', 'Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. f) a g)', '', 'vydane', 'A2 Colná nomenklatúra (§69 12 f, g)'),
    ('kv_clenenie', 'A2IO', 'Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. i)', '', 'vydane', 'A2 Integrované obvody (§69 12 i)'),
    ('kv_clenenie', 'A2MT', 'Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. h)', '', 'vydane', 'A2 Mobilné telefóny (§69 12 h)'),
    ('kv_clenenie', 'A2SP', 'Vyhotovené faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 12 písm. j)', '', 'vydane', 'A2 Stavebné práce (§69 12j)'),
    ('kv_clenenie', 'B1', 'Prijaté faktúry, pri ktorých je osobou povinnou platiť daň príjemca plnenia §69 ods. 2,3,6,7, 9 až 12', '', 'prijate', 'B1 Prenos daňovej povinnosti'),
    ('kv_clenenie', 'B1-0', 'Plnenia vstupujúce do sekcie B1 - bez nároku na odpočet', '', 'prijate', 'B1-0 Prenos daňovej povinnosti, bez nároku na odpočet'),
    ('kv_clenenie', 'B2', 'Prijaté faktúry, z ktorých príjemca plnenia uplatňuje odpočet, vyhotovené platiteľom §69 ods. 1', '', 'prijate', 'B2 Odpočet - Prijaté faktúry'),
    ('kv_clenenie', 'B3', 'Prijaté zjednodušené faktúry podľa §74 ods. 3 písm. a) až c), z ktorých príjemca uplatňuje odpočet', '', 'prijate', 'B3 Odpočet - Ostatné'),
    ('kv_clenenie', 'C1', 'Vyhotovené opravné faktúry podľa §71 ods. 2 zákona', '', 'vydane', 'C1 Vydané faktúry - Opravná'),
    ('kv_clenenie', 'C1CN', 'Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. f) a g)', '', 'vydane', 'C1 Colná nomenklatúra - Opravná (§69 12 f, g)'),
    ('kv_clenenie', 'C1IO', 'Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. i)', '', 'vydane', 'C1 Integrované obvody - Opravná (§69 12 i)'),
    ('kv_clenenie', 'C1MT', 'Vyhotovené opravné faktúry podľa §71 ods. 2 zákona - colná nomenklatúra §69 ods. 12 písm. h)', '', 'vydane', 'C1 Mobilné telefóny - Opravná (§69 12 h)'),
    ('kv_clenenie', 'C2', 'Prijaté opravné faktúry podľa §71 ods. 2 zákona', '', 'prijate', 'C2 Prijaté faktúry - Opravná'),
    ('kv_clenenie', 'C2B1', 'Prijaté opravné faktúry podľa §71 ods. 2 zákona k faktúram uvedeným v B.1.', '', 'prijate', 'C2 Prijaté faktúry - Opravná B1'),
    ('kv_clenenie', 'C2B1-0', 'Plnenia vstupujúce do sekcie C2 k faktúram uvedeným v B1 - bez nároku na odpočet', '', 'prijate', 'C2-0 Prijaté faktúry - Opravná B1, bez nároku na odpočet'),
    ('kv_clenenie', 'D1', 'Dodanie tovarov a služieb - obraty evidované všetkými elektronickými registračnými pokladnicami', '', 'vydane', 'D1 Obraty ERP'),
    ('kv_clenenie', 'D2', 'Dodanie tovarov a služieb, ktoré sa neevidujú elektronickou registračnou pokladnicou', '', 'vydane', 'D2 Dodanie - Ostatné'),
    ('kv_clenenie', 'KN', 'Nezahrňovať do Kontrolného výkazu DPH', '', null, 'KN Nezahrňovať do Kontrolného výkazu DPH')
$function$;

/* ------------------------------------------------ 3) založenie pre firmu */

-- Slovenská firma (prázdna krajina = SK) dostane celý zoznam; čo už má
-- (z Pohody, ručne, z obrázka), ostane, ako je.
create or replace function public.zaloz_systemove_predkontacie(p_company uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  _n integer;
begin
  insert into public.predkontacie (company_id, druh, kod, popis, agenda, typ_dokladu, kategoria, zdroj, aktivne)
  select c.id, z.druh, z.kod, z.popis, z.agenda, z.typ_dokladu, z.kategoria, 'system', true
    from public.companies c
    cross join public.predkontacie_systemove_zoznam() z
   where c.id = p_company
     and coalesce(nullif(upper(btrim(c.country)), ''), 'SK') = 'SK'
  on conflict (company_id, druh, kod, agenda) do nothing;
  get diagnostics _n = row_count;
  return _n;
end;
$function$;

revoke all on function public.zaloz_systemove_predkontacie(uuid) from public, anon, authenticated;
grant execute on function public.zaloz_systemove_predkontacie(uuid) to service_role;

create or replace function public.predkontacie_systemove_pre_firmu()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.zaloz_systemove_predkontacie(new.id);
  return null;
end;
$function$;

revoke all on function public.predkontacie_systemove_pre_firmu() from public, anon, authenticated;

drop trigger if exists companies_systemovy_ciselnik on public.companies;
create trigger companies_systemovy_ciselnik
  after insert or update of country on public.companies
  for each row
  when (coalesce(nullif(upper(btrim(new.country)), ''), 'SK') = 'SK')
  execute function public.predkontacie_systemove_pre_firmu();

/* ------------------------------------------------ 4) ochrana systémových */

/*
  Človek (authenticated/anon) systémový kód nezmaže a nezmení mu kód, druh,
  agendu ani zdroj — skryť ho môže (aktivne = false), popis sa smie doplniť.
  Riadok so zdrojom 'system' si nezaloží (kópia z inej firmy → 'rucne';
  pri upserte na existujúci systémový riadok ho update znova označí 'system').
  Servisný kľúč a kaskáda pri zmazaní firmy prejdú.
*/
create or replace function public.predkontacie_systemove_ochrana()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  _clovek boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'DELETE' then
    if old.zdroj = 'system' and _clovek then
      raise exception 'Systémový kód % sa nedá zmazať — môžete ho len skryť (vypnúť).', old.kod
        using errcode = 'P0001', detail = '_systemovy';
    end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    if new.zdroj = 'system' and _clovek then
      new.zdroj := 'rucne';
    end if;
    return new;
  end if;
  if old.zdroj = 'system' then
    new.zdroj := 'system';
    new.company_id := old.company_id;
    new.druh := old.druh;
    new.kod := old.kod;
    new.agenda := old.agenda;
  elsif new.zdroj = 'system' and _clovek then
    new.zdroj := old.zdroj;
  end if;
  return new;
end;
$function$;

revoke all on function public.predkontacie_systemove_ochrana() from public, anon, authenticated;

drop trigger if exists predkontacie_systemove_ochrana on public.predkontacie;
create trigger predkontacie_systemove_ochrana
  before insert or update or delete on public.predkontacie
  for each row execute function public.predkontacie_systemove_ochrana();

/* ------------------------------------------------ 5) existujúce firmy */

select public.zaloz_systemove_predkontacie(c.id)
  from public.companies c
 where coalesce(nullif(upper(btrim(c.country)), ''), 'SK') = 'SK';

/* ------------------------------------------------ 6) predvyplnenie prijatých a bločkov */

/*
  To isté ako pri vystavených (20261105094902_clenenie_auto_vystavenych):
  logika je v TypeScripte (`resolveVatClassificationPrijatej`,
  clenenie-prijatych.ts), zápis robí fronta automatického účtovania (cron
  každú minútu) servisným kľúčom. Databáza si pamätá:
    clenenie_zdroj / kv_zdroj — 'auto' (automatika prepočíta) / 'rucne'
                                 (zadal človek, nemení sa) / NULL (podľa zhody),
    clenenie_auto_at          — NULL = doklad čaká vo fronte.
  Stĺpec clenenie_auto_at sa pridá BEZ predvolenej hodnoty, takže fronta
  postupne prejde aj existujúce neodovzdané doklady (odovzdané do Pohody
  vynechá — index aj dotaz majú `exported_at is null`). Doklad v uzamknutom
  období automatika nemení; zaúčtovanému len doplní prázdne pole.
*/
do $$
declare
  _t text;
begin
  foreach _t in array array['purchase_invoices', 'expense_documents'] loop
    execute format('alter table public.%I add column if not exists clenenie_zdroj text', _t);
    execute format('alter table public.%I add column if not exists kv_zdroj text', _t);
    execute format('alter table public.%I add column if not exists clenenie_auto_at timestamptz', _t);
    if not exists (select 1 from pg_constraint where conname = _t || '_clenenie_zdroj_check') then
      execute format(
        'alter table public.%I add constraint %I check (clenenie_zdroj in (''auto'', ''rucne''))',
        _t, _t || '_clenenie_zdroj_check');
      execute format(
        'alter table public.%I add constraint %I check (kv_zdroj in (''auto'', ''rucne''))',
        _t, _t || '_kv_zdroj_check');
    end if;
  end loop;
end $$;

comment on column public.purchase_invoices.clenenie_auto_at is
  'Kedy automatika (resolveVatClassificationPrijatej) doklad naposledy prešla; NULL = čaká vo fronte.';
comment on column public.expense_documents.clenenie_auto_at is
  'Kedy automatika (resolveVatClassificationPrijatej) doklad naposledy prešla; NULL = čaká vo fronte.';

create index if not exists purchase_invoices_clenenie_fronta
  on public.purchase_invoices (created_at)
  where clenenie_auto_at is null and exported_at is null and deleted_at is null;
create index if not exists expense_documents_clenenie_fronta
  on public.expense_documents (created_at)
  where clenenie_auto_at is null and exported_at is null;

/*
  Strážca: zmena kódu členenia či KV inou cestou než automatikou (človek,
  API, potvrdenie návrhu) zhodí zdroj na NULL a vráti doklad do fronty —
  automatika potom podľa zhody rozhodne, či je hodnota ručná. Zmena údajov
  v tg_argv (DPH, režim dane, dodávateľ, pravidlo …) → do fronty.
*/
create or replace function public.faktero_clenenie_dokladu_strazca()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  _stare jsonb := to_jsonb(old);
  _nove jsonb := to_jsonb(new);
  _s text;
begin
  if new.clenenie_auto_at is not null and new.clenenie_auto_at is distinct from old.clenenie_auto_at then
    return new;
  end if;
  if new.exported_at is not null then
    return new;
  end if;
  if new.pohoda_clenenie_dph is distinct from old.pohoda_clenenie_dph then
    new.clenenie_zdroj := null;
    new.clenenie_auto_at := null;
  end if;
  if new.kv_clenenie is distinct from old.kv_clenenie then
    new.kv_zdroj := null;
    new.clenenie_auto_at := null;
  end if;
  foreach _s in array tg_argv loop
    if (_stare -> _s) is distinct from (_nove -> _s) then
      new.clenenie_auto_at := null;
      exit;
    end if;
  end loop;
  return new;
end;
$function$;

revoke all on function public.faktero_clenenie_dokladu_strazca() from public, anon, authenticated;

drop trigger if exists purchase_invoices_clenenie_auto on public.purchase_invoices;
create trigger purchase_invoices_clenenie_auto
  before update on public.purchase_invoices
  for each row execute function public.faktero_clenenie_dokladu_strazca(
    'type', 'company_id', 'supplier_ico', 'supplier_name', 'supplier_ic_dph', 'supplier_country',
    'vat_amount', 'amount_total', 'vat_breakdown', 'items', 'reverse_charge', 'reverse_charge_type',
    'dph_rezim', 'eu_plnenie', 'osobitna_uprava', 'odpocet', 'opravuje_cislo', 'pravidlo_id', 'deleted_at'
  );

drop trigger if exists expense_documents_clenenie_auto on public.expense_documents;
create trigger expense_documents_clenenie_auto
  before update on public.expense_documents
  for each row execute function public.faktero_clenenie_dokladu_strazca(
    'company_id', 'supplier_ico', 'supplier_name', 'supplier_ic_dph', 'supplier_country',
    'vat_amount', 'total_amount', 'vat_breakdown', 'odpocet', 'payment_method', 'pravidlo_id', 'status'
  );
