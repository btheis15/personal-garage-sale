# Garage sale: what's left to do

A hand-off for finishing the **personal-garage-sale** site from my MacBook. Paste this into Claude
Code (or keep it in the repo and say "follow NEXT_STEPS.md") and work through it top to bottom.
Every step says where it runs: **MacBook**, **Mac mini** (over `ssh mini`), **Vercel**, or a
website in the browser.

---

## Where things stand (as of Oct 8, 2026)

- **Code:** all merged to `main` in `btheis15/personal-garage-sale` (PRs #1–#3, including the
  Bitcoin Cash wallet receipts and "Spread the word"). Nothing is waiting on a branch.
- **Mac mini:** installed and running (sections 1–4 done). Server at
  `~/Repos/personal-garage-sale/server`, launchd jobs `com.garagesale.{server,backup,duckdns}`,
  `npm test` 29 pass / 0 fail, public at `https://brians-garage-sale.duckdns.org/health`.
  Nightly backups go to iCloud Drive → `Garage Sale Backups` (first one ran Oct 8).
- **Vercel:** connected to the mini. `SHOP_API_URL`, the three secrets and `ADMIN_PASSWORD` are set
  (Production), and `/`, `/sell`, `/share`, `/share/terms` load; `/bcmr/…` reaches the mini.
  Until Oct 8 the project's **Framework Preset was empty ("Other")**, so every build published
  nothing and every page was a 404. It's now **Next.js**: if the site ever 404s everywhere again,
  check that first (Settings → Build and Deployment).
- **Next:** section 5 (first real test from the phone), then Stripe, Bitcoin Cash and emails
  (section 6): code is ready, the keys just aren't in yet.

### How it fits together

```
 Phone: Sell app (/sell) ─┐                                              Mac mini (repo's server/ folder)
                          ├─▶ Vercel: personal-garage-sale ──HTTPS──▶ Caddy :443 ─▶ garage-sale server 127.0.0.1:8797
 Shoppers ────────────────┘    (shop + Sell app UI)                  <name>.duckdns.org     ├─ server/data/garage.db (SQLite)
                                                                                           └─ server/data/media/   (photos)
 Stripe ──"paid" notices──▶ <PUBLIC_URL>/stripe/webhook        Bitcoin Cash: the mini watches the blockchain itself
```

- The **website** (repo root, Next.js 16) holds no data or payment keys. It reads the catalog from
  the mini with `SHOP_API_TOKEN`, and the Sell app writes through it with `SHOP_ADMIN_TOKEN`.
- The **server** (`server/`, Node 22, Express + SQLite) runs on the Mac mini next to Om Threads.
  It uses port **8797** (Om Threads uses 8795/8796) and its own DuckDNS name and Caddy block.
- Full details: `README.md` and `docs/MAC_MINI.md`.

---

## Before starting: decide these

- [x] **DuckDNS name** for this project: `brians-garage-sale` → `brians-garage-sale.duckdns.org`.
      Must be different from Om Threads' (`omthreadsboutique`).
- [x] **Sell app password** (8+ characters) for `ADMIN_PASSWORD`.
- [x] **Backup folder**, e.g. `~/Library/Mobile Documents/com~apple~CloudDocs/Garage Sale Backups`.
- [ ] Optional: a **custom domain** for the site (otherwise `personal-garage-sale.vercel.app`).

---

## 1. Install the server on the Mac mini

Run on the **Mac mini** (from the MacBook: `ssh mini`).

```bash
cd ~/Repos                                     # wherever projects live
git clone https://github.com/btheis15/personal-garage-sale.git
cd personal-garage-sale/server
node -v                                        # must be 22+ (see Om Threads' README for a separate Node 22 if not)
npm ci
npm test                                       # expect "# pass 29" and "# fail 0"
lsof -nP -iTCP:8797 -sTCP:LISTEN               # must print nothing (port free)
npm run setup-env                              # creates server/.env and PRINTS 3 secrets: save them for step 4
```

Then edit `server/.env` (`open -e .env`) and set:

| Setting | Value |
|---|---|
| `SITE_URL` | `https://personal-garage-sale.vercel.app` (or the custom domain) |
| `PUBLIC_URL` | `https://<duckdns-name>.duckdns.org` |
| `DUCKDNS_DOMAIN` | `<duckdns-name>` (just the name) |
| `DUCKDNS_TOKEN` | my DuckDNS account token |
| `BACKUP_DIR` | the backup folder |

Leave Stripe, BCH and SMTP blank for now (section 5).

- [x] Server cloned, `npm test` passes, `.env` made and filled in

## 2. DuckDNS

1. At **duckdns.org**, add the new subdomain (same account as Om Threads).
2. On the **Mac mini**: `./scripts/duckdns-update.sh` → should print `<name>: OK`.

- [x] DuckDNS name points at home

## 3. Caddy (shares port 443 with Om Threads)

On the **Mac mini**:

1. Add the block from `server/deploy/Caddyfile.snippet` to `/opt/homebrew/etc/Caddyfile`, with my
   DuckDNS name in place of `brian-garage-sale`. **Don't touch Om Threads' block.**
2. `caddy validate --config /opt/homebrew/etc/Caddyfile && caddy reload --config /opt/homebrew/etc/Caddyfile`
   (a graceful reload: the same Caddy also serves MLR media and Om Threads, and
   `brew services restart caddy` would cut off anything they're in the middle of serving)

- [x] Caddy block added and Caddy reloaded

## 4. Start the server, and connect Vercel to it

On the **Mac mini**:

```bash
./scripts/install-launchd.sh                   # starts now and at every login; also nightly backup + DuckDNS jobs
tail -f ~/Library/Logs/garage-sale/com.garagesale.server.log   # expect "listening on http://127.0.0.1:8797"
curl https://<duckdns-name>.duckdns.org/health                 # expect {"ok":true} (first call may take a few seconds for the certificate)
```

In **Vercel** → `personal-garage-sale` → Settings → Environment Variables (**Production**, mark
the tokens **Sensitive**):

| Name | Value |
|---|---|
| `SHOP_API_URL` | `https://<duckdns-name>.duckdns.org` |
| `SHOP_API_TOKEN` | from `npm run setup-env` |
| `SHOP_ADMIN_TOKEN` | from `npm run setup-env` |
| `REVALIDATE_SECRET` | from `npm run setup-env` |
| `ADMIN_PASSWORD` | the Sell app password |

Then **Deployments → Redeploy** the latest production deployment. (The site reads `SHOP_API_URL`
at build time for the `/media` photo rewrite, so a redeploy is required.)

- [x] Server running under launchd, `/health` answers over HTTPS
- [x] Vercel variables added and redeployed

## 5. First real test (no payments yet)

1. Open `https://personal-garage-sale.vercel.app/sell` and sign in. On iPhone: Safari → Share →
   **Add to Home Screen**.
2. **Sell → Settings**: set the shop name, tagline, "about" text, **pickup area** (shown to
   everyone, no street address), **pickup details** (address and times, only shown after buying),
   email, phone, Venmo handle. Save.
3. **Settings → Setup** checklist: "The Mac mini" should be ✓.
4. Post one item with a photo (**Sell +**), then **Add several** with 2–3 photos.
5. Open the shop: the sample items are gone, my items show within a few seconds, and photos load.
6. Buy one with **Pay at pickup** → it shows "On hold", the order appears in **Sell → Orders**
   → mark it paid (Cash) → it shows **Sold** in the shop.
7. **Ring up** → pick an item → **Cash** → "Sold!" with the chime.

- [ ] Everything above works

If something fails, check: `~/Library/Logs/garage-sale/com.garagesale.server.log` on the mini,
Vercel's deployment and function logs, and that the three secrets match exactly on both sides.

## 6. Payments and emails (when ready)

All of these go in the **Mac mini's** `server/.env`, then restart:
`launchctl kickstart -k gui/$(id -u)/com.garagesale.server`

### Stripe: my personal account, not Om Threads'
- [ ] Stripe → Developers → API keys → `STRIPE_SECRET_KEY=sk_test_…` (test first)
- [ ] Stripe → Developers → Webhooks → **Add destination** → `https://<duckdns-name>.duckdns.org/stripe/webhook`,
      events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
      `checkout.session.async_payment_failed`, `checkout.session.expired` → its signing secret
      into `STRIPE_WEBHOOK_SECRET=whsec_…`
- [ ] Restart, then buy something with card `4242 4242 4242 4242` (any future date, any CVC).
      The order turns Paid and the item turns Sold.
- [ ] When ready for real money: activate the Stripe account, then repeat both steps with the
      **live** key and a live webhook.

### Bitcoin Cash
- [ ] Make a wallet just for this (Selene: Settings → Wallet → xPub; or Electron Cash: Wallet →
      Information → Master Public Key) → `BCH_XPUB=xpub…` (it can't spend)
- [ ] Restart; the log and **Sell → Settings → Setup** show the **first address**. Check it
      matches the wallet's first receiving address.
- [ ] Test with a $0.25 item (BCH has no test network)
- [ ] Optional, in **Vercel**: `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` from dashboard.reown.com
      (add the site's domain there) for "Connect wallet". Redeploy.

### Bitcoin Cash extras (optional, after BCH works)
- [ ] Hot wallet: on the mini `cd server && npm run new-hot-wallet` → key into `BCH_HOT_WALLET_WIF`
      in `.env`, restart, send its address ~0.001 BCH (docs/MAC_MINI.md → "Bitcoin Cash extras")
- [ ] **Sell → Settings → Set up wallet receipts** (once), then pay a $0.25 item choosing
      "Wallet receipt" and claim it into a CashToken wallet (Cashonize, Paytaca, Zapit)
- [ ] Optional: **Spread the word** (Settings → Bitcoin Cash extras). Read `/share/terms` first;
      sign up yourself at `/share` with a second wallet, buy through the link, and check the cut
      arrives and shows on `/share/me` and in **See your friends**

### Order emails
- [ ] `SMTP_USER=<my gmail>` and `SMTP_PASS=<Gmail app password>` (myaccount.google.com → App
      passwords). Optional `NOTIFY_EMAIL` (where "Sold!" emails go) and `MAIL_FROM`.
- [ ] Restart, do a test order, and check both emails arrive (mine and the buyer's receipt)

## 7. Before announcing it

- [ ] Real items posted; sample items gone
- [ ] Settings → **Shipping** on or off as wanted (and a default shipping price)
- [ ] **Print QR signs & tags** (Sell → Items → "Print QR signs & tags") tried on paper
- [ ] Phone check: the home page animations, an item page, checkout, and the "Buy" bar that
      slides up on item pages
- [ ] Backup ran: `cd server && npm run backup`, then look in the backup folder
- [ ] Optional: custom domain in Vercel → update `SITE_URL` in `server/.env` (and restart) and
      `NEXT_PUBLIC_SITE_URL` in Vercel (and redeploy)

---

## Later / nice to have

- **eBay posting from the Sell app**: planned in `docs/MARKETPLACES.md` (eBay developer account,
  OAuth, Inventory API, ending the eBay listing when it sells here). Facebook Marketplace stays
  copy/paste: Meta has no API for personal listings.
- **Updating the mini after code changes**: from the MacBook, `MINI_HOST=mini server/scripts/update-mini.sh`
  (backs up, pulls `main`, installs if needed, restarts, checks `/health`).
- **Not yet tested for real** (only locally and with stand-ins): the DuckDNS/Caddy connection,
  real Stripe payments and webhooks, real BCH payments, Gmail sending. Watch the first one of each.

## Quick reference

| What | Where |
|---|---|
| Repo | `github.com/btheis15/personal-garage-sale` |
| Website code | repo root (Next.js 16; read `node_modules/next/dist/docs/` before changing it, per `AGENTS.md`) |
| Server code | `server/` (`npm test` there runs its 29 tests) |
| Server settings | `server/.env` on the mini (never committed) |
| Website settings | Vercel → personal-garage-sale → Environment Variables |
| Logs | `~/Library/Logs/garage-sale/` on the mini |
| Restart server | `launchctl kickstart -k gui/$(id -u)/com.garagesale.server` |
| Data | `server/data/` on the mini (database + photos) |
| Sell app | `https://personal-garage-sale.vercel.app/sell` |
| Setup guide | `docs/MAC_MINI.md` |
