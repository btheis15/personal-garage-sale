# Setting up the Mac mini

The garage sale's server (the `server/` folder) runs on the Mac mini next to Om Threads, the same
way: Node, a SQLite database and the photos in its own folder, launchd to keep it running, Caddy
and a DuckDNS address to put it online. It shares nothing with Om Threads except Caddy.

```
 Phone: Sell app ─┐                                               Mac mini
                  ├─▶ personal-garage-sale.vercel.app ──HTTPS──▶ Caddy (443) ──▶ garage-sale server 127.0.0.1:8797
 Shoppers ────────┘    (pages + photos cached by Vercel)           brian-garage-sale.duckdns.org   ├─ data/garage.db
                                   ▲                                                               ├─ data/media/ (photos)
                                   └────── "refresh now" after every change ◀──────────────────────┘
 Stripe ──"paid" notices──▶ <PUBLIC_URL>/stripe/webhook          Bitcoin Cash: the mini watches the blockchain itself
```

- **The website** asks the mini for the catalog (with `SHOP_API_TOKEN`) and keeps a cached copy,
  so the shop stays up if the mini is off for a while.
- **The Sell app** is part of the website, so it works from your phone anywhere (no Tailscale).
  It signs you in with your password, then talks to the mini with a second, separate secret
  (`SHOP_ADMIN_TOKEN`) that only Vercel and the mini know.
- **Payment keys live only on the mini** (`server/.env`), as with Om Threads.

About 30 minutes, from the MacBook over `ssh mini` or at the mini itself.

## 1. Get the code

```bash
cd ~/Repos
git clone https://github.com/btheis15/personal-garage-sale.git
cd personal-garage-sale/server
node -v          # 22 or newer (Om Threads' README has how to install a separate Node 22)
npm ci
npm test         # should end with "fail 0"
```

## 2. Check the port is free

```bash
lsof -nP -iTCP:8797 -sTCP:LISTEN     # should print nothing (Om Threads uses 8795 and 8796)
```

If it's taken, pick another `PORT` in `.env` and use it in the Caddy block too.

## 3. Create the settings file

```bash
npm run setup-env
```

It writes `.env` with three new random secrets and prints them. **Copy those three lines** for
Vercel (step 6). Then open `.env` (`open -e .env`) and set:

- `SITE_URL=https://personal-garage-sale.vercel.app` (or your own domain later)
- `PUBLIC_URL=https://brian-garage-sale.duckdns.org` (your DuckDNS name, next step)
- `DUCKDNS_DOMAIN` / `DUCKDNS_TOKEN`
- `BACKUP_DIR`, e.g. `/Users/<you>/Library/Mobile Documents/com~apple~CloudDocs/Garage Sale Backups`

Stripe, Bitcoin Cash and email can be added later (section 8).

## 4. A DuckDNS address of its own

At [duckdns.org](https://www.duckdns.org) add a **new** subdomain, e.g. `brian-garage-sale`
(separate from Om Threads'). Put the name in `DUCKDNS_DOMAIN` and your token in `DUCKDNS_TOKEN`:

```bash
./scripts/duckdns-update.sh      # should print "brian-garage-sale: OK"
```

## 5. Caddy

Port 443 already goes to Caddy for Om Threads, so this gets its own block, no new port forward:

1. Add the block from [`server/deploy/Caddyfile.snippet`](../server/deploy/Caddyfile.snippet) to
   `/opt/homebrew/etc/Caddyfile` with your DuckDNS name. Leave Om Threads' block as it is.
2. `caddy validate --config /opt/homebrew/etc/Caddyfile && brew services restart caddy`

## 6. Vercel

In Vercel → **personal-garage-sale** → Settings → Environment Variables (Production):

| Name | Value |
|------|-------|
| `SHOP_API_URL` | `https://brian-garage-sale.duckdns.org` |
| `SHOP_API_TOKEN` | from step 3 |
| `SHOP_ADMIN_TOKEN` | from step 3 |
| `REVALIDATE_SECRET` | from step 3 |
| `ADMIN_PASSWORD` | your Sell app password (8+ characters) |

Mark the tokens **Sensitive**. Then **Deployments → Redeploy**.

## 7. Start it

```bash
./scripts/install-launchd.sh       # starts now and at every login, restarts if it stops
tail -f ~/Library/Logs/garage-sale/com.garagesale.server.log
curl https://brian-garage-sale.duckdns.org/health     # {"ok":true}
```

Open `https://personal-garage-sale.vercel.app/sell`, sign in, and post something. It shows in the
shop within a few seconds. **Sell → Settings → Setup** shows what's connected.

On the iPhone: open `/sell` in Safari → Share → **Add to Home Screen**.

## 8. Payments and emails (when you're ready)

All in `server/.env`, then `launchctl kickstart -k gui/$(id -u)/com.garagesale.server`.

**Stripe (your personal account, not Om Threads')**
1. Stripe → Developers → API keys → `STRIPE_SECRET_KEY` (`sk_test_…` first).
2. Stripe → Developers → Webhooks → Add destination → `<PUBLIC_URL>/stripe/webhook`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Its signing secret →
   `STRIPE_WEBHOOK_SECRET`.
3. Buy something with `4242 4242 4242 4242`. Then the same with the live key.

**Bitcoin Cash**
1. A wallet just for this in Selene (Settings → Wallet → xPub) or Electron Cash
   (Wallet → Information → Master Public Key) → `BCH_XPUB`. It can't spend.
2. Restart; the log (and Sell → Settings) shows the first address: check it matches the wallet.
3. Try a $0.25 item (BCH has no test network).
4. Optional: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in Vercel for "Connect wallet".

**Emails**: `SMTP_USER` (your Gmail) and `SMTP_PASS` (a Gmail app password:
myaccount.google.com → App passwords). You get "Sold!" emails; buyers get a receipt with pickup details.

## Day to day

| What | How |
|------|-----|
| Update the server from the MacBook | `MINI_HOST=mini server/scripts/update-mini.sh` |
| Restart it | `launchctl kickstart -k gui/$(id -u)/com.garagesale.server` |
| Logs | `~/Library/Logs/garage-sale/` |
| Back up now | `npm run backup` (also nightly at 3:30 am into `BACKUP_DIR`) |
| Stop and remove the jobs | `./scripts/uninstall-launchd.sh` (keeps `data/`) |

Everything (items, orders, photos) is in `server/data/`. The nightly backup copies the database
(last 30 days) and every photo.
