# Inventúra navigácie — stav pred redizajnom
Vygenerované z `src/components/faktero/AppShell.tsx`; každá trasa overená proti `src/routeTree.gen.ts`.
Zoznam je úplný — obsahuje aj položky skryté za „Viac“ aj tie, ktoré sa zobrazujú podmienene.

## Podmienky zobrazenia
| Podmienka | Čo robí | Kde je v kóde |
|---|---|---|
| **produkt** | `filterNav` pustí len skupiny z `INVOICING_KEYS` alebo `LOGBOOK_KEYS` podľa zvoleného produktu. „Viac“ je v oboch. | `INVOICING_KEYS`, `LOGBOOK_KEYS` |
| **prístup k produktu** | `productMode` (`invoicing` / `logbook` / `both`) prebíja voľbu; kto má prístup k jednému, vidí len ten. | `resolveView` |
| **`companyAdminOnly`** | Položka sa skryje každému, kto nie je `owner` ani `admin` firmy. | `filterNav` |
| **krajina firmy** | Českej firme sa skryjú položky začínajúce `/pokladna` a `/efaktura` (eKasa a slovenská schéma Peppol). | `LEN_SK` |
| **prázdna skupina** | Skupina, ktorej po filtroch neostane ani jedna položka, z lišty zmizne. | `filterNav` |
| **`adminRole`** | Odkaz na Platform Admin sa ukáže len tomu, kto má riadok v `platform_admins`. | avatar |

## Hlavná navigácia

### Prehľad  
`key: prehlad` · produkt: Fakturácia

Bez podpoložiek — skupina je priamy odkaz.

### Fakturácia  
`key: fakturacia` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Faktúry | `/faktury` | — |
| Nová faktúra | `/faktury/nova` | — |
| Rýchla faktúra | `/faktury/rychla` | — |
| Zálohové faktúry | `/zalohove` | — |
| Cenové ponuky | `/ponuky` | — |
| Prijaté objednávky | `/objednavky` | — |
| Nová objednávka | `/objednavky/nova` | — |
| Opakované faktúry | `/opakovane` | — |
| Dobropisy | `/faktury?type=credit` | — |
| Prijaté faktúry | `/prijate-faktury` | — |
| Koncepty | `/faktury?status=draft` | — |
| Skener dokladov | `/faktury/skener` | — |

### Doklady  
`key: doklady` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Prehľad dokladov | `/doklady` | — |
| Nový doklad (foto/QR/upload) | `/doklady/novy` | — |
| Doklady e-mailom | `/doklady/mailom` | — |
| Prehľad eFaktúry | `/efaktura` | len firma registrovaná na SK |
| Odoslané eFaktúry | `/efaktura/odoslane` | len firma registrovaná na SK |
| Prijaté eFaktúry | `/efaktura/prijate` | len firma registrovaná na SK |
| Doručenia eFaktúr | `/efaktura/dorucenia` | len firma registrovaná na SK |

### Kontakty  
`key: kontakty` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Odberatelia | `/odberatelia` | — |
| Nový odberateľ | `/odberatelia?new=1` | — |

### Zákazky  
`key: zakazky` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Prehľad zákaziek | `/zakazky` | — |
| Nová zákazka | `/zakazky/nova` | — |

### Sklad  
`key: sklad` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Prehľad | `/sklad` | — |
| Produkty a služby | `/produkty` | — |
| Cenník a zľavy | `/ceny` | — |
| Cenové akcie | `/ceny/akcie` | — |
| Skladové položky | `/sklad/produkty` | — |
| Kategórie | `/sklad/kategorie` | — |
| Pohyby | `/sklad/pohyby` | — |
| Objednávky u dodávateľov | `/sklad/objednavky` | — |
| Pod minimom | `/sklad/minimum` | — |
| Inventúra | `/sklad/inventura` | — |

### Banka  
`key: banka` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Bankové účty | `/bankove-ucty` | — |
| Bankové transakcie | `/bankove-ucty/transakcie` | — |
| Bankové výpisy | `/bankove-ucty/vypisy` | — |
| Leasingy a úvery | `/financovanie` | — |
| Nová zmluva o financovaní | `/financovanie/nova` | — |
| Pripojiť banku | `/bankove-ucty/pripojit` | — |

### Účtovníctvo  
`key: uctovnictvo` · produkt: Fakturácia

| Podkategória | Route | Podmienka |
|---|---|---|
| Pokladňa | `/pokladna` | len firma registrovaná na SK |
| DPH prehľad | `/uctovnictvo/dph` | — |
| Uzávierka | `/uctovnictvo/uzavierka` | — |
| Účtovné exporty | `/exporty` | — |
| História exportov | `/exporty?tab=history` | — |
| Prepojenie s Pohodou | `/uctovnictvo/pohoda` | — |
| Bankový výpis do Pohody | `/uctovnictvo/vypis-do-pohody` | — |
| Import zo SuperFaktúry | `/importy/superfaktura` | — |
| Import z Pohody a mPohody | `/importy/pohoda` | — |
| Import z Money S3 | `/importy/money-s3` | — |
| Import z Omega | `/importy/omega` | — |
| Import z iDoklad | `/importy/idoklad` | — |
| Import z KROS | `/importy/kros` | — |
| História importov | `/importy` | — |

### Prehľad  
`key: logbook-prehlad` · produkt: Kniha jázd

Bez podpoložiek — skupina je priamy odkaz.

### Jazdy  
`key: jazdy` · produkt: Kniha jázd

| Podkategória | Route | Podmienka |
|---|---|---|
| Jazdy | `/jazdy` | — |
| Nová jazda | `/jazdy/nova` | — |
| Export | `/jazdy/export` | — |

### Vozidlá  
`key: vozidla` · produkt: Kniha jázd

| Podkategória | Route | Podmienka |
|---|---|---|
| Vozidlá a tankovanie | `/jazdy/vozidla` | — |

### Integrácie  
`key: integracie` · produkt: Kniha jázd

| Podkategória | Route | Podmienka |
|---|---|---|
| Prehľad integrácií | `/jazdy/integracie` | — |
| Commander GPS | `/jazdy/integracie/commander` | — |
| Tesla Fleet API | `/jazdy/integracie/tesla` | — |

### Viac  
`key: viac` · produkt: oba produkty

| Podkategória | Route | Podmienka |
|---|---|---|
| Faktero AI | `/ai-asistent` | — |
| Správa firiem | `/firmy` | — |
| Predplatné | `/predplatne` | — |
| Diagnostika | `/diagnostika` | len owner/admin firmy |

## Účet → Nastavenia

V ponuke pod avatarom. Na mobile tá istá ponuka.

| Položka | Route |
|---|---|
| Firma | `/firma` |
| Vzhľad faktúry | `/nastavenia/vzhlad-faktury` |
| Email šablóny | `/nastavenia/email-sablony` |
| Nastavenia systému | `/nastavenia` |

## Účet → API

V ponuke pod avatarom.

| Položka | Route |
|---|---|
| API kľúče | `/api-kluce` |
| API dokumentácia | `/api-dokumentacia` |
| API playground | `/api-playground` |
| Webhooky | `/webhooky` |
| Webhook delivery logy | `/webhooky-logy` |

## Tlačidlo „Vytvoriť“

V hornej lište. Skryté v režime Kniha jázd.

| Položka | Route |
|---|---|
| Nová faktúra | `/faktury/nova` |
| Rýchla faktúra | `/faktury/rychla` |
| Nová cenová ponuka | `/ponuky/nova` |
| Nový odberateľ | `/odberatelia?new=1` |
| Nový produkt | `/produkty?new=1` |
| Nová opakovaná faktúra | `/opakovane/nova` |

## Ďalšie odkazy v ponuke pod avatarom

| Položka | Route / správanie | Podmienka |
|---|---|---|
| Profil | `/nastavenia` | — |
| Predplatné | `/predplatne` | — |
| Pomoc | `/pomoc` | — |
| Nahlásiť chybu alebo návrh | otvorí okno, nie trasu | — |
| Platform Admin | `/admin` | len riadok v `platform_admins` |
| Vzhľad (svetlý/tmavý/podľa systému) | prepínač, nie trasa | — |
| Odhlásiť | odhlási zariadenie | — |

## Ostatné prvky shellu

| Prvok | Správanie |
|---|---|
| Prepínač firmy | zoznam firiem + „Pridať firmu“ |
| Prepínač produktu | Fakturácia ↔ Kniha jázd; len keď má účet prístup k obom |
| Hľadanie (⌘K) | odošle na `/faktury?q=…` |
| Zvonček notifikácií | vlastný komponent |
| Logo | vedie na úvod produktu (`/dashboard` alebo `/jazdy/prehlad`) |
| Mobilné menu | `MobileNav` — tie isté skupiny a položky ako na počítači, plus Odhlásiť |
