# Zlaté vzorky exportov do POHODY

Zlaté vzorky overené importom do skutočnej POHODY (15.–16. 11. 2026).

Každý súbor je presný výstup generátora pre jeden prípad z
`src/lib/faktero/pohoda-zlate-vzorky.test.ts` (XML pre POHODU a súbory
konektora). Test porovnáva výstup bajt po bajte a každé XML overí aj proti
schéme Stormware (`e2e/schemy/pohoda/data.xsd`).

**Zmena vzorky = zmena toho, čo ide do Pohody:** najprv over importom do kópie
PALIERY, potom `npx vitest run src/lib/faktero/pohoda-zlate-vzorky.test.ts -u`.

Súbory ručne neupravuj. Nová vzorka vznikne pridaním prípadu do testu a
behom s `-u`; v commite má byť vidieť, čo sa v XML zmenilo.
