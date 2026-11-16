@echo off
rem Zalozi naplanovanu ulohu, ktora spusti prenos kazdy den o 2:00 v noci.
rem Cas zmenite tak, ze prepisete 02:00 nizsie.
rem
rem Nazov ulohy nesie nazov tohto priecinka. Vsetky firmy z firmy.txt
rem obsluhuje jedna uloha; ked by ste priecinkov mali predsa viac, nazvy
rem sa nezhoduju a jedna uloha druhu neprepise.

for %%i in ("%~dp0.") do set "TENTO=%%~nxi"
set "ULOHA=Faktero - prenos do Pohody - %TENTO%"

schtasks /create /tn "%ULOHA%" /tr "'%~dp0faktero-pohoda.cmd'" /sc daily /st 02:00 /f

if errorlevel 1 (
  echo.
  echo Ulohu sa nepodarilo zalozit. Skuste tento subor spustit ako spravca.
) else (
  echo.
  echo Hotovo. Uloha "%ULOHA%" pobezi kazdy den o 2:00.
)
pause
