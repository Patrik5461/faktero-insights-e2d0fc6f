import { createServerFn } from "@tanstack/react-start";
import { nazovBalicka, nazovUlohy } from "./pohoda-konektor.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { zakladnaAdresa } from "./pohoda-konektor.server";

/**
 * Balíček pre účtovníčku — celý most na jej strane.
 *
 * Zámerne to nie je program, ktorý by sa inštaloval. POHODA vie XML import
 * spustiť z príkazového riadku, takže stačí dávkový súbor a naplánovaná úloha
 * Windows: nič sa nepodpisuje, nič sa neaktualizuje, účtovníčka si obsah vie
 * prečítať v Poznámkovom bloku a kedykoľvek ho zmazať.
 *
 * Kľúč sa vyrába tu a vloží sa rovno do súboru — nikde sa nezobrazuje a nemá
 * ako skončiť v mailoch ani v chate.
 */
function davkovySubor(p: { kluc: string; adresa: string; ico: string; rok: number }): string {
  // Bez diakritiky zámerne: dávkový súbor sa vykonáva v kódovej stránke, ktorú
  // si Windows volí sám, a rozsypané hlásenie by len mýlilo.
  return `@echo off
setlocal enabledelayedexpansion
title Faktero - prenos do Pohody

rem ===========================================================
rem  NASTAVENIE - tieto styri riadky upravte podla svojho PC
rem ===========================================================

rem Cesta k programu POHODA (skontrolujte nazov priecinka)
set "POHODA=C:\\Program Files (x86)\\STORMWARE\\POHODA SK\\Pohoda.exe"

rem Prihlasenie do Pohody. Ked ucet nema heslo, nechajte prazdne.
set "MENO=@"
set "HESLO="

rem Nazov databazy uctovnej jednotky.
rem Najdete ho v Pohode: Subor - Uctovne jednotky - stlpec Databaza.
set "DATABAZA=StwPh_${p.ico || "00000000"}_${p.rok}.mdb"

rem ===========================================================
rem  Dalej uz netreba menit nic
rem ===========================================================

set "KLUC=${p.kluc}"
set "ADRESA=${p.adresa}"
set "PRIECINOK=%~dp0"
set "VSTUP=%PRIECINOK%vstup"
set "ODPOVED=%PRIECINOK%odpoved"
set "HOTOVO=%PRIECINOK%hotovo"
set "PROTOKOL=%PRIECINOK%protokol.txt"

if not exist "%VSTUP%" mkdir "%VSTUP%"
if not exist "%ODPOVED%" mkdir "%ODPOVED%"
if not exist "%HOTOVO%" mkdir "%HOTOVO%"

call :log "--- start ---"

if not exist "%POHODA%" (
  call :log "CHYBA: Pohoda.exe sa nenasla - opravte cestu v tomto subore."
  goto :koniec
)

rem 1. Stiahnutie davky z Faktera. Von ide bezne HTTPS, nic sa neotvara.
set "SUBOR=%VSTUP%\\davka.xml"
if exist "%SUBOR%" del /q "%SUBOR%"
for /f %%k in ('curl -sS -o "%SUBOR%" -w "%%{http_code}" -H "Authorization: Bearer %KLUC%" "%ADRESA%/api/v1/pohoda/davka"') do set "KOD=%%k"

if "%KOD%"=="204" (
  call :log "Nic nove na prenos."
  goto :koniec
)
if not "%KOD%"=="200" (
  call :log "Faktero odpovedalo %KOD% - prenos preskoceny."
  goto :koniec
)
call :log "Davka stiahnuta."

rem 2. Konfiguracia importu. Pise sa zakazdym, aby sedeli cesty.
> "%PRIECINOK%import.ini" (
  echo [XML]
  echo database=%DATABAZA%
  echo input_dir=%VSTUP%
  echo response_dir=%ODPOVED%
  echo check_duplicity=1
  echo action_after_processing=2
  echo Move_to=%HOTOVO%
)

rem 3. Nacitanie do Pohody. /wait - inak by sa pokracovalo skor, nez skonci.
call :log "Spustam import do Pohody..."
start "" /wait "%POHODA%" /XML "%MENO%" "%HESLO%" "%PRIECINOK%import.ini"
call :log "Import skoncil."

rem 4. Odpoved spat do Faktera - z nej sa dozvie cisla dokladov a chyby.
dir /b "%ODPOVED%\\*.xml" >nul 2>&1 || call :log "Pohoda nevratila ziadnu odpoved - pozrite protokol importu v Pohode."
for %%f in ("%ODPOVED%\\*.xml") do (
  for /f %%k in ('curl -sS -o nul -w "%%{http_code}" -X POST -H "Authorization: Bearer %KLUC%" -H "Content-Type: text/xml" --data-binary "@%%f" "%ADRESA%/api/v1/pohoda/odpoved"') do set "KOD2=%%k"
  if "!KOD2!"=="200" (
    move /y "%%f" "%HOTOVO%" >nul
    call :log "Odpoved odoslana: %%~nxf"
  ) else (
    call :log "Odpoved sa odoslat nepodarila ^(!KOD2!^): %%~nxf"
  )
)

:koniec
call :log "--- koniec ---"
endlocal
exit /b 0

:log
rem Presmerovanie je pred echom zamerne: ked by text koncil cislicou,
rem cmd by ju spojil so znakmi >> a vzalo by to ako presmerovanie prudu.
>>"%PROTOKOL%" echo %date% %time% %~1
echo %~1
exit /b
`;
}

function nastavenieUlohy(nazov: string): string {
  return `@echo off
rem Zalozi naplanovanu ulohu, ktora spusti prenos kazdy den o 2:00 v noci.
rem Cas zmenite tak, ze prepisete 02:00 nizsie.
rem Nazov ulohy nesie firmu — pri viacerych firmach tak jedna druhej
rem naplanovanu ulohu neprepise.

schtasks /create /tn "${nazov}" /tr "'%~dp0faktero-pohoda.cmd'" /sc daily /st 02:00 /f

if errorlevel 1 (
  echo.
  echo Ulohu sa nepodarilo zalozit. Skuste tento subor spustit ako spravca.
) else (
  echo.
  echo Hotovo. Uloha "${nazov}" pobezi kazdy den o 2:00.
)
pause
`;
}

function navod(p: { firma: string; adresa: string; uloha: string; priecinok: string }): string {
  return `PRENOS DOKLADOV Z FAKTERA DO POHODY
${"=".repeat(45)}

Firma: ${p.firma}

Čo to robí
----------
Raz denne v noci si tento priečinok stiahne z Faktera doklady, ktoré
ešte v Pohode nie sú, načíta ich do Pohody a pošle späť správu o tom,
ako import dopadol. Vďaka tomu Faktero vie, ktoré doklady sa naozaj
založili a aké čísla dostali.

Nič sa neinštaluje a Pohoda nemusí byť spustená — dávkový súbor si ju
spustí sám a po skončení zavrie. Von ide len bežné HTTPS spojenie,
takže sa neotvárajú žiadne porty.

Nastavenie (raz, asi päť minút)
-------------------------------
1. Celý priečinok skopírujte na počítač, kde je POHODA.
   Odporúčame C:\\Faktero\\${p.priecinok} — cesta bez medzier a diakritiky.
   Keď vediete viac firiem, každá musí mať **vlastný priečinok**;
   dávkový súbor pracuje vždy len v tom svojom.

2. Otvorte faktero-pohoda.cmd v Poznámkovom bloku
   (pravé tlačidlo → Upraviť) a hore vyplňte:

   POHODA    — cesta k Pohoda.exe
   MENO      — prihlasovacie meno do Pohody (@ = admin)
   HESLO     — heslo; keď žiadne nie je, nechajte prázdne
   DATABAZA  — názov databázy účtovnej jednotky.
               Nájdete ho v Pohode: Súbor → Účtovné jednotky,
               stĺpec Databáza (napr. StwPh_12345678_2026.mdb).

3. Dvakrát kliknite na faktero-pohoda.cmd a pozrite sa, čo vypíše.
   Prvý beh je najlepšie spustiť, keď v Pohode nikto nepracuje.

4. Keď prvý beh prejde, spustite nastav-ulohu.cmd — založí
   naplánovanú úlohu na 2:00 v noci. Ak sa nepodarí, spustite ho
   pravým tlačidlom → Spustiť ako správca.

Čo v priečinku vzniká
---------------------
vstup\\      stiahnutá dávka pred načítaním
odpoved\\    odpoveď z Pohody pred odoslaním späť
hotovo\\     spracované súbory (archív, dá sa občas vyprázdniť)
protokol.txt čo sa kedy stalo — sem sa pozrite, keď niečo nesedí
import.ini   konfigurácia importu; prepisuje sa pri každom behu

Časté otázky
------------
Musí byť počítač zapnutý?
  Áno, v čase, keď má úloha bežať. Keď je vypnutý, prenos sa vynechá
  a doklady prídu ďalšiu noc — nič sa nestratí.

Môže sa doklad naimportovať dvakrát?
  Nie. Pohoda má zapnutú kontrolu duplicity a každý doklad má stály
  identifikátor, takže druhý pokus odmietne.

Čo keď Pohoda niektorý doklad odmietne?
  Dôvod uvidíte v protokole importu a Faktero ho dostane v odpovedi.
  Taký doklad sa vráti do fronty a príde znova, keď sa chyba opraví.

Mám v Pohode viac firiem, čo s tým?
  Pre každú firmu si stiahnite v Fakteru vlastný balíček a dajte ho
  do vlastného priečinka. Každý si nesie svoj kľúč, svoju databázu
  účtovnej jednotky aj vlastnú naplánovanú úlohu, takže si navzájom
  neprekážajú. Časy úloh môžete rozložiť (2:00, 2:20, 2:40) — Pohoda
  vie naraz spracovať len jeden import.

Ako to vypnem?
  Zrušte naplánovanú úlohu (Plánovač úloh → ${p.uloha})
  alebo zmažte celý priečinok. V Fakteru sa dá kľúč zneplatniť
  v Nastavenia → API kľúče.

Podpora: ${p.adresa}
`;
}

/**
 * Vyrobí kľúč a stiahnuteľný balíček pre účtovníčku.
 *
 * Kľúč sa vytvára pri každom stiahnutí nový — starý ostáva platný, takže sa dá
 * balíček znovu poslať bez toho, aby prestal fungovať ten, čo už beží. Zrušiť
 * sa dajú v Nastavenia → API kľúče.
 */
export const pripravKonektorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: company, error: cErr } = await supabase
      .from("companies")
      .select("id, name, ico")
      .eq("id", data.companyId)
      .single();
    if (cErr) throw new Error(cErr.message);
    if (!company) throw new Error("Firma nenájdená");

    const bajty = new Uint8Array(24);
    crypto.getRandomValues(bajty);
    const kluc = `fk_live_${Array.from(bajty)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    const hash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(kluc))),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const { error: kErr } = await supabase.from("api_keys").insert({
      company_id: data.companyId,
      mode: "live",
      name: "Pohoda — konektor",
      prefix: kluc.slice(0, 14),
      key_hash: hash,
    });
    if (kErr) throw new Error(kErr.message);

    const adresa = zakladnaAdresa();
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "faktero-pohoda.cmd",
      davkovySubor({
        kluc,
        adresa,
        ico: String(company.ico ?? "").replace(/\D/g, ""),
        rok: new Date().getFullYear(),
      }),
    );
    const firma = String(company.name ?? "");
    const uloha = nazovUlohy(firma);
    zip.file("nastav-ulohu.cmd", nastavenieUlohy(uloha));
    // BOM, nech Poznámkový blok prečíta diakritiku.
    zip.file(
      "NAVOD.txt",
      "\ufeff" +
        navod({
          firma,
          adresa,
          uloha,
          priecinok: nazovBalicka(firma).replace(/^faktero-pohoda-|\.zip$/g, "") || "firma",
        }),
    );

    return {
      base64: await zip.generateAsync({ type: "base64" }),
      fileName: nazovBalicka(firma),
    };
  });

/** Stav konektora do rozhrania — beží vôbec, a čo naposledy priniesol. */
export const stavKonektoraFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const [{ data: kluce }, { data: potvrdene }] = await Promise.all([
      supabase
        .from("api_keys")
        .select("id, last_used_at, revoked_at")
        .eq("company_id", data.companyId)
        .eq("name", "Pohoda — konektor")
        .order("created_at", { ascending: false }),
      supabase
        .from("export_logs")
        .select("invoice_number, pohoda_cislo, pohoda_stav, potvrdene_at, error")
        .eq("company_id", data.companyId)
        .not("potvrdene_at", "is", null)
        .order("potvrdene_at", { ascending: false })
        .limit(5),
    ]);

    const zive = (kluce ?? []).filter((k: { revoked_at: string | null }) => !k.revoked_at);
    const naposledy = zive
      .map((k: { last_used_at: string | null }) => k.last_used_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;

    return {
      kluce: zive.length,
      naposledy: naposledy ?? null,
      potvrdene: potvrdene ?? [],
    };
  });
