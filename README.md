# Personal Garage Sale

My own website for selling my things: a shop that takes cards (my personal Stripe account) and
Bitcoin Cash, plus a **Sell app** for the phone: take a photo or two, add a price and a few words,
tap **Post it**, and it's on the site. The same app rings up in-person sales (garage sale,
Marketplace meetups) and keeps track of orders. Facebook Marketplace and eBay: see
[docs/MARKETPLACES.md](docs/MARKETPLACES.md).

Built from the Om Threads Boutique site and admin, but all in one project on **Vercel**, with
**Supabase** for the data and photos, so there's no Mac mini, Tailscale or DuckDNS to keep running.

```
 Phone (Sell app, /sell) ──┐                          ┌─▶ Stripe Checkout (cards, Apple/Google Pay) ──webhook──┐
                           ├─▶ Vercel (this Next.js app) ─┤                                                        │
 Shoppers (/, /shop) ──────┘        │                     └─▶ Bitcoin Cash: public Fulcrum servers (no company)    │
                                    ▼                                                                              │
                        Supabase: Postgres (items, orders) + Storage (photos) ◀─────────────────────────────────────┘
```

## What it does

**The shop** (`/`, `/shop`, `/item/…`): items with photos, price stickers, condition, "or best
offer", pickup or shipping. Search and categories. Sold items stay visible as **Sold** for two weeks.

**Checkout** (`/checkout`): the buyer picks
- **Card, Apple Pay or Google Pay** through Stripe Checkout (Stripe hosts the card form),
- **Bitcoin Cash** straight into your own wallet, with the animated payment screen from
  [bch_cashtoken_checkout](https://github.com/btheis15/bch_cashtoken_checkout): QR code, "open in
  wallet", optional Connect wallet, zero-conf with double-spend proofs, or
- **Pay at pickup** (cash or Venmo), with the item held for 48 hours (you choose).

While someone is paying, the item is **held** (shown "On hold") so nobody else can buy it; if they
don't finish, it goes back by itself. Two buyers can never get the last one (it's decided inside
the database in one step).

**The Sell app** (`/sell`, add it to your home screen):
- **Sell (+)**: take photos or pick from the library (they're shrunk on the phone and uploaded
  straight to Supabase), price, title, condition, category, a few words → **Post it**. More
  options: quantity, "or best offer", "was" price, shipping, featured, private notes. A half-done
  item survives closing the app.
- **Items**: everything, with For sale / Drafts / Sold / Hidden. Tap to edit, mark sold, hide, or
  **List it elsewhere** (copy the text and photos for Facebook Marketplace or eBay, keep the link).
- **Ring up**: in person, tap what they're buying, then **Cash / Venmo / Other** (recorded, and off
  the website at once) or **They pay on their phone**: a QR code they scan to pay by card or BCH,
  and the screen turns to **Sold!** when it lands.
- **Orders**: To do (paid, or held for pickup), Paying now, Done. Mark paid at pickup, picked up /
  shipped, cancel (items back for sale), notes, the buyer's contact links.
- **Settings**: name, tagline, banner, pickup area and pickup details (only shown after buying),
  contact, pay at pickup, shipping, and a **Setup** checklist of what's connected.

## Setting it up (about 30 minutes)

### 1. Supabase (the database and photos)

1. At [supabase.com](https://supabase.com), **New project** (e.g. `personal-garage-sale`; the free
   plan is plenty). Pick a region near you and save the database password somewhere.
2. **SQL Editor → New query**, paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), **Run**.
   It makes the tables, the functions that hold and sell items, and the public `photos` bucket.
3. **Project Settings → API**: copy the **Project URL** and the **service_role** secret key.

### 2. Vercel (the website)

1. [vercel.com/new](https://vercel.com/new) → import `btheis15/personal-garage-sale`. No build
   settings to change.
2. **Settings → Environment Variables**, from [`.env.example`](.env.example). To start:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, `CRON_SECRET`.
3. **Redeploy**. Open `https://<your-project>.vercel.app/sell`, sign in, and post something.

### 3. Stripe (your personal account)

1. Sign in to **your personal** Stripe account (not Om Threads'). Turn on **Test mode**.
2. **Developers → API keys** → secret key (`sk_test_…`) into `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add destination**: endpoint `https://<your site>/api/stripe/webhook`,
   events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`. Its signing secret
   (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. Redeploy.
4. Buy something with the test card `4242 4242 4242 4242` (any future date, any CVC).
5. When it works: activate the account in Stripe, then repeat 2–3 in live mode (`sk_live_…`).

Selling your own used things (a garage sale) generally isn't subject to sales tax, so the
checkout doesn't add any. Check your state's rules if you start selling things you buy to resell.

### 4. Bitcoin Cash

1. Make a wallet just for this in **Selene** (or Electron Cash) and copy its **xPub**
   (Selene: Settings → Wallet → xPub). It can list the wallet's addresses but can't spend.
2. Put it in `BCH_XPUB` and redeploy. **Sell → Settings → Setup** shows the wallet's first
   address: check it matches the wallet's first receiving address.
3. Optional **Connect wallet** (pay in one tap from Cashonize, Paytaca or Zapit): a free project
   ID at [dashboard.reown.com](https://dashboard.reown.com), with your site's domain added, in
   `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.

BCH has no test network: try it with a $0.25 item. Payments count at zero-conf once no
double-spend proof turns up within a few seconds; the screen checks the blockchain itself while
the buyer has it open, and the daily job catches anything that arrives later.

### 5. Order emails (optional)

A [Resend](https://resend.com) API key in `RESEND_API_KEY` sends you "Sold!" emails and the buyer
a receipt with the pickup details. Until you verify your own domain in Resend it can only send to
your own address, so add a domain (and `NOTIFY_FROM`) when you want buyers to get receipts.
Without it, everything still shows in the Sell app.

### 6. On your phone

Open `https://<your site>/sell` in Safari → **Share → Add to Home Screen**. It opens like an app
and stays signed in for 60 days.

## Local development

```bash
npm install
cp .env.example .env.local   # optional: without it you get the sample shop
npm run dev                  # http://localhost:3000, Sell app at /sell
```

| Command | What it does |
|---------|--------------|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route types + TypeScript |
| `npm test` | The database functions, run in PGlite (Postgres in WebAssembly) |

## Project layout

```
src/app/(shop)/          the shop: home, shop, item, about, checkout, order (incl. the BCH payment screen)
src/app/sell/            the Sell app: items, new item, edit, ring up, orders, settings (password protected)
src/app/api/checkout     places an order (holds the items) and starts Stripe / BCH / pay at pickup
src/app/api/orders/…     the buyer's order: status, pay or switch method, cancel, Bitcoin Cash
src/app/api/sell/…       the Sell app's API (login, items, photo uploads, orders, ring up, settings)
src/app/api/stripe/webhook   Stripe's "paid" / "expired" notices
src/app/api/cron         daily clean-up (vercel.json)
src/components/          shop UI; sell/ is the Sell app; bch/ is the payment screen from bch_cashtoken_checkout
src/lib/                 items, orders, settings, auth, stripe, bch (engine wiring), notify (emails)
src/lib/bch-engine/      the Bitcoin Cash engine from bch_cashtoken_checkout, unchanged
supabase/migrations/     the database: tables and the functions that hold, sell and release items
test/                    tests for those functions
```
