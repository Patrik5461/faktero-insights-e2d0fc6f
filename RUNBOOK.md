# Faktero — Operations Runbook

Prevádzková príručka VM (Ubuntu), PM2, deploy webhook, SSL, secrets a pg_cron.

## 1. Aplikácia (PM2)

`ecosystem.config.cjs` je uložený mimo repo na VM v `~/ecosystem.config.cjs`.
Obsahuje dva procesy: `faktero` (Node server na porte 3000) a `webhook` (deploy webhook na porte 9002).

```bash
pm2 start ~/ecosystem.config.cjs
pm2 save
pm2 startup   # systemd unit pre auto-štart po reboote
pm2 status
pm2 logs faktero --lines 200
pm2 restart faktero
```

Referenčný obsah `ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: "faktero",
      cwd: "/root/faktero/current",
      script: ".output/server/index.mjs",
      env_file: "/root/faktero-secrets.env",
      env: { NODE_ENV: "production", PORT: "3000" },
      max_memory_restart: "700M",
    },
    {
      name: "webhook",
      cwd: "/root/webhook",
      script: "server.js",
      env_file: "/root/faktero-secrets.env",
      env: { PORT: "9002" },
    },
  ],
};
```

## 2. Deploy webhook

`~/webhook/server.js` počúva na porte 9002, overuje GitHub HMAC signature (`WEBHOOK_SECRET`)
a pri push do `main` spustí `~/webhook/deploy.sh`, ktorý:

1. `git pull` do `/root/faktero/next`
2. `bun install && bun run build`
3. atomický `mv` do `/root/faktero/current`
4. `pm2 restart faktero`

Nginx smeruje `https://deploy.faktero.sk/hook` → `127.0.0.1:9002`.

Manuálny deploy: `~/webhook/deploy.sh`.

## 3. Nginx + SSL

- Nginx config: `/etc/nginx/sites-enabled/faktero.conf` (proxy_pass na `127.0.0.1:3000`).
- Certifikáty: Certbot, `/etc/letsencrypt/live/faktero.sk/`.
- Auto-renew: systemd timer `certbot.timer` (bežne 2× denne).

```bash
certbot certificates
certbot renew --dry-run
systemctl status certbot.timer
```

## 4. Secrets (`~/faktero-secrets.env`)

Master file. **Zálohujte pri každej zmene** (offline copy do password managera).
Nikdy necommitovať do repa.

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
GOPAY_WEBHOOK_SECRET=...
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

Po zmene `.env`: `pm2 restart faktero webhook`.

## 5. pg_cron joby

Bežia priamo v Supabase Postgres, volajú TanStack public routes cez `net.http_post`
s hlavičkou `apikey: <SUPABASE_ANON_KEY>`.

| Job                             | Schedule     | Endpoint                            |
| ------------------------------- | ------------ | ----------------------------------- |
| `faktero-recurring-daily`       | `15 3 * * *` | `/api/public/hooks/recurring-run`   |
| `faktero-reminders-daily`       | `30 7 * * *` | `/api/public/hooks/reminders`       |
| `faktero-trial-lifecycle-daily` | `0 6 * * *`  | `/api/public/hooks/trial-lifecycle` |
| `faktero-push-overdue-daily`    | `0 8 * * *`  | `/api/public/hooks/push-overdue`    |
| `faktero-commander-sync-hourly` | `0 * * * *`  | `/api/public/hooks/commander-sync`  |

Zobraziť: `SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;`
História: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 50;`

## 6. Zálohy databázy

Denný `pg_dump` na VM (`/root/backups/YYYY-MM-DD.sql.gz`) cron 02:00, retencia 30 dní.
Supabase point-in-time recovery je zapnuté v projekte.

## 7. Bežné incidenty

- **Preview 502**: `pm2 restart faktero`, potom `pm2 logs faktero`.
- **`Unsupported state or unable to authenticate data` (Commander/Tesla)**:
  `PAYMENT_SECRETS_KEY` sa zmenil — odpojiť a znovu pripojiť integráciu.
- **Nebežia upomienky / opakované**: check `cron.job_run_details`,
  overiť dostupnosť `APP_PUBLIC_URL` a `FAKTERO_CRON_TOKEN`.
- **Rate limit 429 z API**: 300 requestov / 5 minút per API kľúč; klient má rešpektovať `Retry-After`.
