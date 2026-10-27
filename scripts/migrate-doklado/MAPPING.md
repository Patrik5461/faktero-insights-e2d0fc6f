# Migrácia Doklado → Faktero — mapovanie polí

Jednorazový presun cez Doklado Public API (`api-gateway-prod-europe-west-1-7epuecvu.ew.gateway.dev`,
hlavička `api_key`). Typy API sú vygenerované z `https://api-doc.doklado.sk/swagger.json` do
`doklado-api.d.ts` (`npx openapi-typescript@7.4.4`).

**Z Doklada sa len číta.** Volajú sa výhradne tieto endpointy:

| Endpoint                             | Načo                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `POST /v3/organization/manage/list`  | firmy (organizácie), ku ktorým má kľúč prístup                                   |
| `POST /v2/documents`                 | zoznam dokladov firmy (`organizationId` = IČO), stránkovanie `continuationToken` |
| `POST /v2/documents/get`             | detail jedného dokladu                                                           |
| `POST /v2/documents/attachments/get` | odkazy na súbory dokladu (`downloadUrl`)                                         |
| `POST /v1/documents/get-invoice-pdf` | PDF vystavenej faktúry (base64)                                                  |

**Spotreba (Doklado účtuje 1 € za 1 000 jednotiek):** zoznam dokladov = 1 jednotka za doklad
(čítajú sa dva výbery podľa `isExported`, takže každý doklad raz), prílohy = 1 za doklad s
prílohami, PDF faktúry = 1. Detail (`/v2/documents/get`) zoznam nesie celý, preto sa pri prenose
nevolá — len v dry-run pri ukážke troch dokladov. Prenos firmy s N dokladmi stojí zhruba 2–3 × N
jednotiek. Stránkuje sa cez `searchAfter`; 429 po vyčerpaní limitu API prepojenia beh zastaví.

Skript má zoznam povolených ciest natvrdo; `setExported` ani žiadny zapisujúci endpoint
(`create`, `update`, `upsert`, `invoice-issue`, `send-invoice-by-email`, `accounting-settings/*`)
zavolať nevie.

---

## 1. Firmy — `PublicOrganization` → `companies`

| Doklado                   | Faktero   | Poznámka                                  |
| ------------------------- | --------- | ----------------------------------------- |
| `identificationNumber`    | `ico`     | párovací kľúč, porovnáva sa len číslicami |
| `name`                    | `name`    | len pri zakladaní novej firmy             |
| `taxIdentificationNumber` | `dic`     | len pri zakladaní                         |
| `countryCode`             | `country` | `SK`/`CZ`, inak `SK`                      |

- Firma s rovnakým IČO **práve raz** → spárovaná.
- **Tobify a PALIERA sa nepárujú automaticky** (meno obsahuje `tobify` / `paliera`) — vypíšu sa
  a prenesú sa len s `--company <IČO>` a `--pripojit-k <company_id>`. Obe už doklady majú
  (PALIERA 66 vystavených + 20 prijatých, Tobify 60 + 1 + 3), navyše existuje prázdna firma
  „paliera“ bez IČO.
- Viac firiem s tým istým IČO → nepáruje sa, vypíše sa.
- Firma vo Fakteri chýba → založí sa **len s `--vlastnik <e-mail>`** (dostane rolu `owner`;
  spúšťač `create_trial_subscription` jej založí skúšobné predplatné). Bez neho sa iba vypíše.

## 2. Partneri (odberatelia a dodávatelia) → `customers`

Doklado nemá vlastný adresár partnerov — partner je v hlavičke každého dokladu.

| Doklado (`InvoiceV2`/`DocumentV2`)                                   | Faktero `customers`   |
| -------------------------------------------------------------------- | --------------------- |
| `organizationName`                                                   | `name`                |
| `organizationId`                                                     | `ico`                 |
| `organizationTaxId`                                                  | `dic`                 |
| `organizationVatId`                                                  | `ic_dph`              |
| `address.streetName` + `buildingNumber`/`propertyRegistrationNumber` | `street`              |
| `address.municipality`                                               | `city`                |
| `address.postalCode`                                                 | `zip`                 |
| `address.country`                                                    | `country` (inak `SK`) |
| `paymentInfo.iban` (prijaté)                                         | `iban`                |

- Deduplikácia **v rámci firmy podľa IČO**; partner bez IČO podľa mena bez diakritiky a veľkosti písmen.
- Existujúci kontakt sa **neprepisuje**; ak mu chýba rola, pribudne (`odberatel` pri vystavenej,
  `dodavatel` pri prijatej faktúre). Bločky partnera do adresára nezakladajú.

## 3. Vystavené faktúry — `InvoiceV2` (podtyp `*_issued`/`*_exposed`) → `invoices` + `invoice_items`

| Doklado                                     | Faktero `invoices`                                                              | Poznámka                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documentId`                                | `doklado_id` (nový stĺpec)                                                      | idempotencia                                                                                                                                                                                                                                                                                |
| `subType`                                   | `type`                                                                          | `domestic/foreign_exposed` → `regular`; `*_credit_issued` → `credit_note`; `*_debit_issued` → `debit_note`; `*_advance_issued` → `advance_payment`; `corrective_tax_issued` → `credit_note` + `oprava_25a`; `tax_document_issued` → `regular` s poznámkou „daňový doklad k prijatej platbe“ |
| `invoiceNumber`                             | `invoice_number`                                                                | **pôvodné číslo sa zachová**                                                                                                                                                                                                                                                                |
| (číslice na konci čísla)                    | `sequence_number`                                                               | informatívne — pozri „Číselný rad“                                                                                                                                                                                                                                                          |
| `issuedAt`                                  | `issue_date`                                                                    | dátum bez času, časové pásmo Europe/Bratislava                                                                                                                                                                                                                                              |
| `deliveryDate` (inak `taxPointDate`)        | `delivery_date`                                                                 |                                                                                                                                                                                                                                                                                             |
| `dueDate`                                   | `due_date`                                                                      | chýba → `issue_date`                                                                                                                                                                                                                                                                        |
| `paymentInfo.vs`                            | `variable_symbol`                                                               | chýba → číslice z čísla faktúry                                                                                                                                                                                                                                                             |
| `paymentInfo.ks` / `ss`                     | `constant_symbol` / `specific_symbol`                                           |                                                                                                                                                                                                                                                                                             |
| `paymentInfo.iban`                          | `payment_iban`                                                                  |                                                                                                                                                                                                                                                                                             |
| `orderReference`                            | `order_number`                                                                  |                                                                                                                                                                                                                                                                                             |
| `currency`                                  | `currency`                                                                      | chýba → `EUR`                                                                                                                                                                                                                                                                               |
| `exchangeRate`                              | `exchange_rate`                                                                 | len pri cudzej mene; `exchange_rate_source` ostáva prázdny                                                                                                                                                                                                                                  |
| `paymentType`                               | `payment_method`                                                                | `transfer`→`bank_transfer`, `cash`→`cash`, `card`→`card`, inak `bank_transfer`                                                                                                                                                                                                              |
| `paymentStatus`                             | `status`, `paid_at`                                                             | `paid` → `paid` (dátum úhrady API nedáva → `paid_at` = `due_date`, ak je v minulosti, inak `issue_date`); ostatné → `issued`                                                                                                                                                                |
| `vatCategory = reverse_charge`              | `reverse_charge = true`, `reverse_charge_type`                                  | `domestic_*` → `domestic_69`, `foreign_*` → `eu_b2b`                                                                                                                                                                                                                                        |
| `note` / `customText`                       | `notes` / `intro_note`                                                          |                                                                                                                                                                                                                                                                                             |
| `internalNote`                              | `int_poznamka`                                                                  |                                                                                                                                                                                                                                                                                             |
| partner (kap. 2)                            | `customer_id` + kópia `customer_*`                                              |                                                                                                                                                                                                                                                                                             |
| `vatSummary[]`                              | `subtotal`, `vat_total`, `total`                                                | súčet `taxBase`, `vatAmount`; `total` = `totalPrice`                                                                                                                                                                                                                                        |
| `accountingSettings.accountingItem.value`   | `pohoda_predkontacia`                                                           |                                                                                                                                                                                                                                                                                             |
| `accountingSettings.classificationVat.code` | `pohoda_clenenie_dph`                                                           |                                                                                                                                                                                                                                                                                             |
| —                                           | `import_source = 'doklado'`, `imported_at`, `original_external_id = documentId` | ako ostatné importy                                                                                                                                                                                                                                                                         |

**Položky** (`items[]` → `invoice_items`):

| Doklado `ExportItemV2`         | Faktero                                 | Poznámka                                                                                              |
| ------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `name`                         | `name`                                  |                                                                                                       |
| `note`                         | `description`                           |                                                                                                       |
| `quantity`                     | `quantity`                              |                                                                                                       |
| `unit`                         | `unit`                                  | chýba → `ks`                                                                                          |
| `price`                        | `unit_price`                            | **bez DPH alebo s DPH sa zistí zo súčtov** — `Σ price×qty` sa porovná so základom aj s celkom dokladu |
| `vatRate`                      | `vat_rate`                              |                                                                                                       |
| `vatAmount`                    | `vat_amount`                            | chýba → dopočíta sa                                                                                   |
| `discount.discountPercent`     | `discount_percent`                      |                                                                                                       |
| `itemType = advance_payment`   | nie položka → `advance_amount` hlavičky | rovnako ako import z Pohody                                                                           |
| `vatCategory = reverse_charge` | `prenesenie = true`, `vat_amount = 0`   | spúšťač `invoice_items_pdp_kontrola` DPH pri prenesení odmietne                                       |

- Faktúra bez položiek dostane jednu položku zo `vatSummary` (po sadzbách).
- **Dobropis sa ukladá záporne** (množstvo aj sumy), ako ho ukladá Faktero; ak Doklado pošle
  kladné čísla, skript ich otočí.

**PDF:** `get-invoice-pdf` → kôš `invoice-attachments`, riadok v `invoice_attachments`
(„Faktúra z Doklada.pdf“). Do `pdf_url` sa **nedáva** — Faktero si svoje PDF generuje a pri zmene
by originál prepísalo. Originál, ktorý odberateľ dostal, ostane ako príloha.

**Číselný rad:** `faktero_next_invoice_number` sa nevolá. Ďalšie číslo vo Fakteri sa počíta zo
šablóny a `start_from` v `number_series`, nie zo `sequence_number` — preto po prenose firmy skript
zavolá tú istú funkciu ako ostatné importy (`rozpoznajRadyPoImporte`): firme bez vlastných faktúr
rad **nastaví** (šablóna + `start_from` za najvyšším prenesenými číslom), firme s vlastnými ho len
**navrhne** do súhrnu.

## 4. Prijaté faktúry — `InvoiceV2` (podtyp `*_received`, `*_credit`, `*_advance`, `*_debit`, `*_tax_received`) → `purchase_invoices`

| Doklado                                                              | Faktero `purchase_invoices`                                           | Poznámka                                                                                                                                                             |
| -------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documentId`                                                         | `doklado_id`                                                          |                                                                                                                                                                      |
| `invoiceNumber`                                                      | `invoice_number`                                                      | číslo dodávateľa                                                                                                                                                     |
| `originalNumber`                                                     | `opravuje_cislo`                                                      | pri dobropise                                                                                                                                                        |
| `subType`                                                            | `type`, znamienko                                                     | `*_advance` → `proforma`; `*_credit` → `regular`, sumy záporné; ostatné → `regular`                                                                                  |
| `organizationName` / `Id` / `TaxId` / `VatId`                        | `supplier_name` / `ico` / `dic` / `ic_dph`                            | + `customer_id` (kap. 2)                                                                                                                                             |
| `address.*`                                                          | `supplier_street` / `city` / `zip` / `country`                        |                                                                                                                                                                      |
| `paymentInfo.iban`                                                   | `supplier_iban`                                                       |                                                                                                                                                                      |
| `paymentInfo.vs` / `ks` / `ss`                                       | `variable_symbol` / `constant_symbol` / `specific_symbol`             |                                                                                                                                                                      |
| `issuedAt`                                                           | `issue_date`, `received_date`                                         |                                                                                                                                                                      |
| `deliveryDate` / `taxPointDate`                                      | `delivery_date`                                                       |                                                                                                                                                                      |
| `dueDate`                                                            | `due_date`                                                            |                                                                                                                                                                      |
| `paymentStatus = paid`                                               | `status = 'paid'`, `payment_date`                                     | dátum úhrady chýba → `due_date`                                                                                                                                      |
| inak                                                                 | `status = 'booked'` ak má predkontáciu, inak `received`               | ako import prijatých dokladov                                                                                                                                        |
| `vatSummary` / `totalPrice`                                          | `amount_without_vat`, `vat_amount`, `amount_total`                    |                                                                                                                                                                      |
| `vatCategory` + podtyp                                               | `dph_rezim`, `reverse_charge`, `reverse_charge_type`                  | `reverse_charge` + `domestic_*` → `samozdanenie`/`domestic_69`; `reverse_charge` + `foreign_*` → `nadobudnutie`/`eu_b2b`; `tax_exempt` → `bez_dane`; inak `tuzemsko` |
| `currency`, `exchangeRate`                                           | `currency`, `exchange_rate`                                           |                                                                                                                                                                      |
| `paymentType`                                                        | `payment_method`                                                      | `transfer`→`prevod`, `cash`→`hotovost`, `card`→`karta`                                                                                                               |
| `orderReference` / `deliveryNoteNumber`                              | `order_number` / `delivery_note_number`                               |                                                                                                                                                                      |
| `note` / `internalNote`                                              | `note` / `int_poznamka`                                               |                                                                                                                                                                      |
| `items[]`                                                            | `items` (jsonb `{name, quantity, unit_price, vat_rate, total, unit}`) |                                                                                                                                                                      |
| `accountingSettings.accountingItem.value` / `classificationVat.code` | `pohoda_predkontacia` / `pohoda_clenenie_dph`                         | ak sú, `zauctovane_at` = teraz, `zauctovanie_zdroj = 'manual'`                                                                                                       |
| `accountingSettings.expenditureCenter.code` / `activity.code`        | `stredisko` / `cinnost`                                               |                                                                                                                                                                      |
| —                                                                    | `source = 'import'`                                                   |                                                                                                                                                                      |

**Súbory:** `attachments/get` (`documentType: "expense"`) → kôš `purchase-invoices`; súbor
`primary` do `file_path` / `file_mime` / `file_size`. Prijatá faktúra nemá tabuľku príloh, takže
`secondary` súbory sa nahrajú vedľa a ich zoznam pôjde do `int_poznamka`.

## 5. Bločky — `DocumentV2` (`type = receipt`) → `expense_documents`

| Doklado                                            | Faktero `expense_documents`                                             | Poznámka                                                             |
| -------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `documentId`                                       | `doklado_id`                                                            |                                                                      |
| `invoiceNumberV2` / `invoiceNumber` / `receiptUID` | `document_number`                                                       | prvé neprázdne                                                       |
| `receiptUID`                                       | `qr_raw`                                                                | UID eKasy, nech sa dá doklad dohľadať                                |
| `organizationName` / `Id` / `VatId`                | `supplier_name` / `supplier_ico` / `supplier_ic_dph`                    |                                                                      |
| `issuedAt`                                         | `issue_date`                                                            |                                                                      |
| `totalPrice`                                       | `total_amount`                                                          |                                                                      |
| `vatSummary[]`                                     | `vat_breakdown` (`[{sadzba, zaklad, dph}]`), `net_amount`, `vat_amount` |                                                                      |
| `paymentType`                                      | `payment_method`                                                        | `cash`→`hotovost`, `card`→`karta`, `transfer`→`prevod`, inak `karta` |
| hotovosť                                           | `mimo_pokladne = true`                                                  | staré bločky nesmú pohnúť stavom pokladne                            |
| `items[]`                                          | `items`                                                                 |                                                                      |
| `note` / `internalNote`                            | `note` / `int_poznamka`                                                 |                                                                      |
| `accountingSettings.*`                             | `pohoda_predkontacia`, `pohoda_clenenie_dph`, `stredisko`, `cinnost`    | + `zauctovane_at` ako pri prijatých                                  |
| —                                                  | `source = 'import'`, `status = 'processed'`, `processed_at`             |                                                                      |

**Súbory:** `attachments/get` → kôš `expense-receipts`, `file_path`.

## 6. Čo sa deje okolo zápisu

- **Idempotencia.** Migrácia (čaká na schválenie) pridá `doklado_id text` do `invoices`,
  `purchase_invoices` a `expense_documents` s jedinečným indexom `(company_id, doklado_id)`.
  Opakovaný beh doklad s rovnakým `doklado_id` preskočí. Pred zápisom sa navyše hľadá **ten istý
  doklad z predošlého importu** — vystavená podľa `invoice_number`, prijatá podľa IČO dodávateľa +
  čísla, bloček podľa IČO + čísla + dátumu + sumy. Nájdený sa neprepíše, len dostane `doklado_id`.
- **Súbory** majú cestu odvodenú z `documentId` (`<company_id>/doklado/<documentId>/<súbor>`)
  a nahrávajú sa s `upsert`, takže opakovaný beh nič nezdvojí. Nahráva sa cez Storage API.
- **Automatické zaúčtovanie** by staré doklady bralo ako nové — skript nastaví
  `auto_uctovanie_at` = teraz, takže ich autopilot obíde.
- **Konektor Pohody** berie doklady od začiatku minulého mesiaca. Doklad, ktorý bol v Doklade
  označený ako exportovaný (`isExported`), dostane `exported_at` (vystavená faktúra aj riadok
  v `export_logs` so `status = 'ok'`), aby ho konektor neposlal do Pohody druhýkrát.
- **Webhook „faktúra uhradená“** sa spúšťa len pri zmene stavu (`AFTER UPDATE OF status`);
  faktúra sa zapisuje rovno v konečnom stave, takže webhook neodíde.
- **Zamknuté obdobie** (`companies.locked_until`) a **predplatné** (`FAKTERO_PLAN_BLOCK`) zápis
  odmietnu — doklad sa zapíše do chýb a pokračuje sa ďalším.
- `--since <dátum>` obmedzí doklady podľa dátumu vystavenia (`dateType: "issue"`).

## Otvorené otázky (rozhodne Patrik pred zápisom)

1. Firmy, ktoré vo Fakteri nie sú: zakladať (a s ktorým vlastníkom), alebo len vypísať?
2. Tobify / PALIERA: pripojiť k existujúcej firme (a ktorej — PALIERA má dve), alebo vynechať?
3. PDF vystavených faktúr ako príloha (navrhnuté), alebo ako hlavné PDF faktúry?
4. Exportované v Doklade označiť ako odovzdané do Pohody (navrhnuté), alebo nie?
5. `paid_at` / `payment_date`: API dátum úhrady nedáva — splatnosť (navrhnuté), alebo prázdne?
