@echo off
setlocal enabledelayedexpansion
title Faktero - prenos do Pohody

rem ===========================================================
rem  NASTAVENIE - spolocne pre vsetky firmy v tomto priecinku
rem ===========================================================

rem Cesta k programu POHODA (skontrolujte nazov priecinka)
set "POHODA=C:\Program Files (x86)\STORMWARE\POHODA SK\Pohoda.exe"

rem Prihlasenie do Pohody. Ked ucet nema heslo, nechajte prazdne.
set "MENO=@"
set "HESLO="

rem ===========================================================
rem  Ktore firmy sa prenasaju, je vo firmy.txt vedla tohto suboru.
rem  Jeden riadok na firmu:  KLUC;DATABAZA;NAZOV;DATABAZA_MINULY_ROK
rem  Posledne pole je volitelne - na prelome rokov sa do nej prenesu
rem  doklady minuleho roka, do DATABAZA len tohtorocne.
rem  Jeden kluc pre viac firiem nesie za zavinacom ICO firmy:
rem  KLUC@12345678 - kluc je vo vsetkych riadkoch ten isty.
rem  Dalej uz netreba menit nic.
rem ===========================================================

set "ADRESA=https://www.faktero.sk"
set "PRIECINOK=%~dp0"
set "ZOZNAM=%PRIECINOK%firmy.txt"
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
if not exist "%ZOZNAM%" (
  call :log "CHYBA: chyba subor firmy.txt - bez neho nevieme, co prenasat."
  goto :koniec
)

rem Firmy sa beru po jednej. Pohoda vie naraz spracovat len jeden import,
rem takze paralelne by to aj tak neslo - a takto sedi kazda odpoved k svojmu
rem klucu. Riadky zacinajuce na # su poznamky.
for /f "usebackq eol=# tokens=1,2,3,4 delims=;" %%a in ("%ZOZNAM%") do (
  set "KLUC=%%a"
  set "DATABAZA=%%b"
  set "NAZOV=%%c"
  set "PRELOM=%%d"
  call :firma
)

goto :koniec

rem ===========================================================
rem  Jedna firma
rem ===========================================================
:firma
if "%KLUC%"=="" exit /b
rem Poistka na poznamku, ktorej sa do zaciatku dostal BOM: Poznamkovy blok
rem ho pri ulozeni v UTF-8 pridava sam a "eol=#" ho uz nerozpozna.
echo %KLUC%| findstr /b /c:"fk_" >nul || exit /b
rem Kluc pre viac firiem: firma (ICO alebo id) je za zavinacom.
set "FIRMA="
for /f "tokens=1,2 delims=@" %%x in ("%KLUC%") do (
  set "KLUC=%%x"
  set "FIRMA=%%y"
)
if "%DATABAZA%"=="" (
  call :log "%NAZOV%: PRESKOCENE - v firmy.txt chyba nazov databazy."
  exit /b
)

rem Odpoved z predosleho behu, ktoru sa nepodarilo odoslat, patri inej firme
rem ako tej, ktora ide teraz - poslat ju s cudzim klucom by bola chyba.
for %%f in ("%ODPOVED%\*.xml") do (
  move /y "%%f" "%HOTOVO%" >nul
  call :log "Odlozena neodoslana odpoved z predosleho behu: %%~nxf"
)

rem Prelom rokov: najprv doklady minuleho roka do databazy minuleho roka,
rem potom tohtorocne do beznej. Bez nej ide vsetko naraz ako doteraz.
if not "%PRELOM%"=="" (
  set "CAST=prelom"
  set "DB=%PRELOM%"
  call :prenos
  set "CAST=bezny"
  set "DB=%DATABAZA%"
  call :prenos
) else (
  set "CAST="
  set "DB=%DATABAZA%"
  call :prenos
)
exit /b

rem ===========================================================
rem  Jeden prenos do jednej databazy
rem ===========================================================
:prenos
set "URL=%ADRESA%/api/v1/pohoda/davka"
set "ODPOVED_URL=%ADRESA%/api/v1/pohoda/odpoved"
set "SPOJ=?"
set "SPOJ2=?"
if not "%CAST%"=="" (
  set "URL=%URL%?cast=%CAST%"
  set "SPOJ=&"
)
rem Pri kluci pre viac firiem povie, ktorej firme davka a odpoved patria.
if not "%FIRMA%"=="" (
  set "URL=%URL%%SPOJ%company=%FIRMA%"
  set "ODPOVED_URL=%ODPOVED_URL%?company=%FIRMA%"
  set "SPOJ2=&"
)
rem Hlasenie, ze Pohoda nic nevratila - Faktero vrati doklady do fronty hned.
set "BEZ_URL=%ODPOVED_URL%%SPOJ2%bez_odpovede=1"

rem 1. Stiahnutie davky z Faktera. Von ide bezne HTTPS, nic sa neotvara.
rem    Cez PowerShell (faktero-http.ps1) - Windows Server 2016 a starsie nemaju program na HTTPS z prikazoveho riadku.
set "SUBOR=%VSTUP%\davka.xml"
if exist "%SUBOR%" del /q "%SUBOR%"
set "KOD=0"
for /f %%k in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%URL%" -Kluc "%KLUC%" -Vystup "%SUBOR%"') do set "KOD=%%k"

if "%KOD%"=="204" (
  call :log "%NAZOV% %CAST%: nic nove na prenos."
  if exist "%SUBOR%" del /q "%SUBOR%"
  exit /b
)
if not "%KOD%"=="200" (
  call :log "%NAZOV%: Faktero odpovedalo %KOD% - preskocene."
  if exist "%SUBOR%" del /q "%SUBOR%"
  exit /b
)
rem Odrezany subor (prerusene spojenie) by Pohoda nenacitala - davka sa vrati do fronty.
findstr /c:"</dat:dataPack>" "%SUBOR%" >nul 2>&1 || (
  call :log "%NAZOV%: davka prisla neuplna - import sa nespusta, Faktero ju posle znova."
  del /q "%SUBOR%"
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%BEZ_URL%" -Kluc "%KLUC%" -Text "neuplny subor" >nul
  exit /b
)
call :log "%NAZOV%: davka stiahnuta."

rem 2. a 3. Import do Pohody (podprogram :importuj nizsie).
call :importuj
rem POHODA na SQL serveri databazu s koncovkou .mdb nenajde ("Nepodarilo sa
rem otvorit databazovy subor") a odpoved nevrati - skusi sa este bez koncovky.
dir /b "%ODPOVED%\*.xml" >nul 2>&1 || (
  if /i "!DB:~-4!"==".mdb" (
    set "DB=!DB:~0,-4!"
    call :log "%NAZOV%: databaza s koncovkou .mdb sa neotvorila - skusam !DB!"
    call :importuj
  )
)

rem 4. Odpoved spat do Faktera - z nej sa dozvie cisla dokladov a chyby.
dir /b "%ODPOVED%\*.xml" >nul 2>&1 || (
  call :log "%NAZOV%: Pohoda nevratila ziadnu odpoved - pozrite protokol importu v Pohode. Doklady pojdu znova."
  powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%BEZ_URL%" -Kluc "%KLUC%" -Text "bez odpovede" >nul
)
for %%f in ("%ODPOVED%\*.xml") do (
  set "KOD2=0"
  for /f %%k in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%PRIECINOK%faktero-http.ps1" -Url "%ODPOVED_URL%" -Kluc "%KLUC%" -Subor "%%f"') do set "KOD2=%%k"
  if "!KOD2!"=="200" (
    move /y "%%f" "%HOTOVO%" >nul
    call :log "%NAZOV%: odpoved odoslana (%%~nxf)"
  ) else (
    call :log "%NAZOV%: odpoved sa odoslat nepodarila (!KOD2!): %%~nxf"
  )
)
exit /b

rem ===========================================================
rem  Import jednej davky do databazy %DB%
rem ===========================================================
:importuj
rem Konfiguracia importu. Pise sa zakazdym, lebo databaza je ina firma od firmy.
> "%PRIECINOK%import.ini" (
  echo [XML]
  echo database=%DB%
  echo input_dir=%VSTUP%
  echo response_dir=%ODPOVED%
  echo check_duplicity=1
  echo action_after_processing=2
  echo Move_to=%HOTOVO%
)

rem Nacitanie do Pohody. /wait - inak by sa pokracovalo skor, nez skonci.
call :log "%NAZOV% %CAST%: spustam import do Pohody (%DB%)..."
start "" /wait "%POHODA%" /XML "%MENO%" "%HESLO%" "%PRIECINOK%import.ini"
call :log "%NAZOV%: import skoncil."
exit /b

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
