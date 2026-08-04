# Faktero — Operations Runbook

Prevádzková príručka VM (Ubuntu), PM2, deploy webhook, SSL, secrets a pg_cron.

> Overené voči skutočnému stavu VM 2026-08-04. Predchádzajúca verzia popisovala
> `/root/...` cesty, `deploy.sh` a `bun`, ktoré na stroji nie sú.

## 1. Aplikácia (PM2)

Bežia dva procesy:

| Proces    | Skript                                                      | Port |
| --------- | ----------------------------------------------------------- | ---- |
| `faktero` | `/home/patrik/faktero-invoice-hub/.output/server/index.mjs` | 3000 |
| `webhook` | `/home/patrik/webhook/server.js`                            | 9002 |

`~/ecosystem.config.cjs` definuje **len** proces `faktero`; `webhook` bol
naštartovaný ručne a je v PM2 uložený cez `pm2 save`.

```bash
pm2 status
pm2 logs faktero --lines 200
pm2 restart faktero
pm2 restart webhook
pm2 save          # po každej zmene zoznamu procesov
pm2 startup       # systemd unit pre auto-štart po reboote
```

⚠️ `~/ecosystem.config.cjs` má dnes všetky tajomstvá **natvrdo v `env:`**.
Správne má používať `env_file: /home/patrik/faktero-secrets.env` a mať práva
`600`. Kým to platí, súbor je citlivý ako samotný master secrets file.

## 2. Deploy webhook

`~/webhook/server.js` počúva na `127.0.0.1:9002`. Nginx ho vystavuje na
`https://www.faktero.sk/webhook` (nie `deploy.faktero.sk` — tá doména v nginxe
nie je).

Overuje **GitHub HMAC signature** (`X-Hub-Signature-256`, `crypto.timingSafeEqual`).
Secret sa načíta z `WEBHOOK_SECRET` alebo z `/home/patrik/webhook/.webhook-secret`.
Bez secretu server odmietne každý request s 503.

Reaguje len na `X-GitHub-Event: push` s `ref = refs/heads/main`. Ostatné eventy
a vetvy vráti 200 s `ignored`. Súbežné deploye blokuje jednoduchý zámok.

Deploy beží inline v `server.js` (žiadny `deploy.sh`):

1. `git reset --hard HEAD && git clean -fd -e .env` — `-e .env` je nutné, `.env`
   je netrackovaný a bez výnimky by ho clean zmazal
2. `git pull`
3. doplní chýbajúce kľúče do `.env` z `~/faktero-secrets.env`
4. `npm install`
5. `NODE_OPTIONS=--max-old-space-size=6144 NITRO_PRESET=node-server npm run build`
   — default V8 heap (~2 GB) na tento build **nestačí** a padá na OOM
6. `pm2 startOrRestart ~/ecosystem.config.cjs --update-env`

**Nastavenie v GitHube:** Settings → Webhooks → Payload URL
`https://www.faktero.sk/webhook`, Content type `application/json`, Secret =
obsah `~/webhook/.webhook-secret`.

Manuálny deploy (keď secret ešte nie je nastavený):

```bash
cd /home/patrik/faktero-invoice-hub && git pull && npm install \
  && NODE_OPTIONS=--max-old-space-size=6144 NITRO_PRESET=node-server npm run build \
  && pm2 restart faktero
```

## 3. Správca balíkov

**npm je autoritatívny** (`package-lock.json`). Deploy aj build bežia cez npm,
`bun` na VM nainštalovaný nie je. `bun.lock` bol odstránený — pinoval zraniteľný
`xlsx@0.18.5` a ticho by ho vrátil každému, kto spustí `bun install`.

`xlsx` sa neinštaluje z npm, ale z pripnutého SheetJS CDN tarballu
(`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) — npm verzia má
prototype pollution a ReDoS bez opravy. Pri upgrade meň URL na konkrétnu
verziu, nikdy nie `xlsx-latest`, inak build prestane byť reprodukovateľný.

## 4. Nginx + SSL

- Config: `/etc/nginx/sites-enabled/faktero` (bez prípony `.conf`)
  - `location /` → `127.0.0.1:3000`, `client_max_body_size 20M`
  - `location /webhook` → `127.0.0.1:9002`
- Certifikáty: Certbot, `/etc/letsencrypt/live/faktero.sk/`
- Auto-renew: `certbot.timer` (aktívny, 2× denne)

```bash
certbot certificates
certbot renew --dry-run
systemctl status certbot.timer
nginx -t && systemctl reload nginx
```

## 5. Secrets (`~/faktero-secrets.env`)

Master file, práva `600`. **Zálohujte pri každej zmene** (offline kópia do
password managera). Nikdy necommitovať do repa — `.env` je od 2026-08-04
netrackovaný a odstránený aj z histórie.

Kľúčové premenné:

```
SUPABASE_URL=...
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
RESEND_FROM_EMAIL=faktury@faktero.sk
LOVABLE_API_KEY=...
GOPAY_GOID=...
GOPAY_CLIENT_ID=...
GOPAY_CLIENT_SECRET=...
GOPAY_WEBHOOK_SECRET=...        # ak je prázdny, webhook prijíma neoverené notifikácie
GOPAY_ENV=production|sandbox
TB_CLIENT_ID=...
TB_CLIENT_SECRET=...
TB_SCOPE=AISP
FINSTAT_PUBLIC_KEY=...
FINSTAT_PRIVATE_KEY=...
FINSTAT_STATION_ID=...
FINSTAT_STATION_NAME=...
EPOSTAK_CLIENT_ID=...
EPOSTAK_CLIENT_SECRET=...
EPOSTAK_ENV=production|test
TESLA_CLIENT_ID=...
TESLA_CLIENT_SECRET=...
TESLA_REDIRECT_URI=...
COMMANDER_SYNC_SECRET=...
PAYMENT_SECRETS_KEY=...    # AES-GCM master key; rotácia vyžaduje re-encrypt uložených credentials
FAKTERO_CRON_TOKEN=...
FCM_PROJECT_ID=...
FCM_SERVICE_ACCOUNT_JSON=...
GOOGLE_SEO_CLIENT_ID=...
GOOGLE_SEO_CLIENT_SECRET=...
GOOGLE_SEO_REDIRECT_URI=...
APP_PUBLIC_URL=https://www.faktero.sk
```

`WEBHOOK_SECRET` je samostatne v `~/webhook/.webhook-secret`.

Po zmene: `pm2 restart faktero webhook --update-env`.

### Rotácia `PAYMENT_SECRETS_KEY`

Týmto kľúčom sú šifrované GoPay/Tesla/Commander credentials obchodníkov
(`company_payment_providers.encrypted_client_secret`). Samotné prepísanie kľúča
existujúce credentials **znefunkční** — treba ich najprv dešifrovať starým
kľúčom a znova zašifrovať novým, alebo integrácie odpojiť a znova pripojiť.
Kľúč musí byť náhodný (`openssl rand -base64 48`), nie čitateľná fráza.

## 6. pg_cron joby

Bežia priamo v Supabase Postgres. HTTP joby volajú TanStack public routes cez
`net.http_post`.

| Job                             | Schedule     | Čo robí                                   |
| ------------------------------- | ------------ | ----------------------------------------- |
| `faktero-recurring-daily`       | `15 3 * * *` | `/api/public/hooks/recurring-run`         |
| `faktero-prune-logs`            | `40 3 * * *` | `SELECT public.prune_operational_logs();` |
| `faktero-trial-lifecycle-daily` | `0 6 * * *`  | `/api/public/hooks/trial-lifecycle`       |
| `faktero-reminders-daily`       | `30 7 * * *` | `/api/public/hooks/reminders`             |
| `faktero-push-overdue-daily`    | `0 8 * * *`  | `/api/public/hooks/push-overdue`          |
| `faktero-commander-sync-hourly` | `0 * * * *`  | `/api/public/hooks/commander-sync`        |

HTTP hooky sa autentifikujú hlavičkou `x-faktero-cron-token: <FAKTERO_CRON_TOKEN>`
(`commander-sync` používa `x-faktero-cron-secret: <COMMANDER_SYNC_SECRET>`).

```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;
```

### Retencia logov

`public.prune_operational_logs()` denne:

- `api_logs` — po 30 dňoch vyprázdni `request_body`/`response_body` (obsahujú
  osobné údaje), po 90 dňoch riadok zmaže
- `webhook_logs`, `webhook_delivery_logs`, `company_lookup_logs` — 90 dní
- `commander_sync_logs`, `tesla_sync_logs` — 30 dní
- `billing_events` — 365 dní
- `seo_cache` — 7 dní po expirácii

Nemaže auditnú stopu (`platform_audit_logs`, `stock_audit_logs`) ani doklady
o odoslaní faktúr (`invoice_email_logs`, `quote_email_logs`, `import_logs`,
`export_logs`).

## 7. Zálohy databázy

Supabase point-in-time recovery je zapnuté v projekte.

⚠️ Denný `pg_dump` na VM sa nepodarilo overiť — používateľ `patrik` nemá žiadny
crontab a `/root/backups` je neprístupný. Pred spoľahnutím sa na túto zálohu si
over, že reálne beží a že dump je obnoviteľný.

## 8. Bežné incidenty

- **Preview 502**: `pm2 restart faktero`, potom `pm2 logs faktero`.
- **Deploy sa nespustí po pushi**: webhook vracia 401 → v GitHube nesedí secret.
  Over `pm2 logs webhook`, hľadaj `odmietnutý request — neplatná signatúra`.
- **Deploy padne na OOM**: build potrebuje `NODE_OPTIONS=--max-old-space-size=6144`.
- **`Unsupported state or unable to authenticate data` (Commander/Tesla)**:
  `PAYMENT_SECRETS_KEY` sa zmenil — odpojiť a znovu pripojiť integráciu.
- **Nebežia upomienky / opakované**: check `cron.job_run_details`,
  overiť dostupnosť `APP_PUBLIC_URL` a `FAKTERO_CRON_TOKEN`.
- **Rate limit 429 z API**: 300 requestov / 5 minút per API kľúč; klient má
  rešpektovať `Retry-After`.
