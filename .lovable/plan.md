# GoPay Billing — Implementačný plán

## 1. Tajné kľúče (vyžaduje akciu používateľa)
Pridám 4 runtime secrets (server-side only, nikdy vo frontende):
- `GOPAY_CLIENT_ID`
- `GOPAY_CLIENT_SECRET`
- `GOPAY_GOID`
- `GOPAY_ENV` (`sandbox`)

Spustí sa secure formulár — hodnoty zadáš ty.

## 2. Databáza (jedna migrácia)

**`subscription_plans`** — katalóg plánov
- `slug`, `name`, `price_monthly` (cent), `invoice_limit` (NULL = neobmedzené), `user_limit`, `api_enabled`, `webhooks_enabled`, `recurring_enabled`, `active`

Seed: `starter` (9 €), `business` (19 €), `premium` (39 €), `enterprise` (cena NULL).

**`subscriptions`** — jedna aktívna na company
- `company_id`, `plan_id`, `status` (`trialing`/`active`/`past_due`/`canceled`/`expired`), `trial_ends_at`, `current_period_start/end`, `gopay_payment_id`, `gopay_subscription_id`, `cancel_at_period_end`

**`billing_payments`** — história platieb, unique na `(provider, provider_payment_id)` pre idempotenciu

**`billing_events`** — audit GoPay notifikácií / interných udalostí

RLS: členovia firmy môžu čítať svoje záznamy; zápis len cez server functions (service role).

**Trigger:** rozšírim `handle_new_company` (alebo `create_company_with_owner`) o automatické založenie 14-dňového trial `subscriptions` riadku na business plán.

## 3. Server functions — `src/lib/faktero/billing.functions.ts`
- `getMyBilling()` — aktuálny plán + trial + použitie (faktúry tento mesiac, počet userov, API on/off)
- `listPlans()`
- `createCheckout({ planSlug })` — vytvorí GoPay payment cez REST API, vráti `gw_url`
- `getPaymentHistory()`
- `cancelSubscription()` — nastaví `cancel_at_period_end`
- `reactivateSubscription()`

**Helpers** (`src/lib/faktero/plan-enforcement.ts`):
- `getCompanyPlan(companyId)`, `hasFeature(companyId, feature)`, `enforceInvoiceLimit`, `enforceUserLimit`

Zapojím `enforceInvoiceLimit` do existujúcich `createInvoice` server fns a `enforceUserLimit` do invite flow. API endpoints a recurring jobs skontrolujú `hasFeature`.

## 4. GoPay klient (`src/lib/faktero/gopay.server.ts`)
- OAuth token cache
- `createPayment({ amount, orderNumber, returnUrl, notifyUrl, payerEmail })`
- `getPaymentStatus(id)`
- Base URL podľa `GOPAY_ENV` (sandbox vs prod)

## 5. Webhook — `src/routes/api/webhooks/gopay.ts`
GoPay posiela GET notifikáciu s `id` parametrom. Handler:
1. Načíta status z GoPay servera (nikdy nedôveruje payloadu).
2. Upsert `billing_payments` podľa `provider_payment_id` (idempotentné).
3. Pri `PAID` → aktivuje/predĺži `subscriptions`, posunie `current_period_end` o mesiac.
4. Zapíše `billing_events`.

URL pre GoPay konfiguráciu vrátim po nasadení.

## 6. Frontend — `/predplatne`
Nový route `src/routes/_authenticated/predplatne.tsx`:
- Karta s aktuálnym plánom + trial countdown + usage bary (faktúry, používatelia)
- Mriežka plánov so „Zvoliť plán" tlačidlami → `createCheckout` → redirect na `gw_url`
- Po návrate `?payment=success|failed` zobrazí toast a refetchne stav
- Tabuľka histórie platieb
- Tlačidlá zrušiť / reaktivovať

Banner „Skúšobná verzia končí o X dní" v `AppShell` ked je trial < 7 dní; banner „Predplatné je neaktívne — read-only režim" keď expired.

Read-only enforcement: server fns na vytvorenie faktúr/zákazníkov/quote/API key vrátia chybu, UI tlačidlá disabled.

## 7. Admin — `/admin/subscriptions`
Rozšírim existujúcu stránku:
- stĺpce: company, plan, status, trial ends, period, GoPay ID, mesačná cena, posledná platba
- akcie (modal): nastav plán / predĺž trial / zruš / reaktivuj
- každá akcia → server fn s `requireSupabaseAuth` + `is_platform_admin` check + zápis do `platform_audit_logs`

## 8. Bezpečnosť
- GoPay tajomstvá len v `*.server.ts`, načítané vnútri handlerov
- Všetky billing zápisy cez `supabaseAdmin` v server fns
- Webhook idempotent cez unique constraint
- Žiadna aktivácia plánu bez potvrdenia GoPay statusu

## 9. Mimo rozsahu (zatiaľ)
- GoPay recurring (`gopay_subscription_id` len pripravené v schéme)
- Produkčný mód
- Faktúra za predplatné (faktúry pre Faktero zákazníkov vystaví Faktero team mimo systém)

---

Po schválení plánu si vyžiadam GoPay sandbox credentials cez secure formulár, potom spustím migráciu a postupne dodám kód.
