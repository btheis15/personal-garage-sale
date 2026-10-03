# Personal Garage Sale

My own website for selling things from around the house, to neighbours, Facebook Marketplace
buyers, and anyone who finds the link. It's a shop that takes cards (through my personal Stripe
account), Bitcoin Cash, or payment at pickup. It comes with a **Sell app** for the phone: take a
photo, tap a price, say what it is, tap **Post it**. The same app rings up sales at the garage
sale itself.

It's built from the Om Threads Boutique site and admin, and runs the same way: the website is on
**Vercel**, and everything that decides something (items, photos, orders, payments) lives on the
**Mac mini** (the `server/` folder).

```
 Phone: Sell app ─┐                                                  Mac mini (server/)
                  ├─▶ Vercel: this Next.js site ──SHOP_API_URL──▶ Caddy ─▶ garage-sale server :8797
 Shoppers ────────┘     shop · checkout · Sell app                         SQLite · photos · Stripe · Bitcoin Cash
```

## What it does

**The shop** (`/`, `/shop`, `/item/…`) is a plain, friendly site. Items have photos, price,
condition, size and brand for clothes, "or best offer", and pickup or shipping. You can search and
browse by category. Sold things stay visible as **Sold** for two weeks.

**Checkout** lets the buyer pay
- with a **card, Apple Pay or Google Pay** (Stripe Checkout), or
- with **Bitcoin Cash** straight into your wallet, using the payment screen from
  [bch_cashtoken_checkout](https://github.com/btheis15/bch_cashtoken_checkout), or
- **at pickup** (cash or Venmo), with the item held for 48 hours.

While someone pays, the item shows **On hold** and nobody else can buy it. If they don't finish,
it goes back on sale by itself.

**The Sell app** (`/sell`, add it to your home screen):
- **Sell (+)** starts with photos (camera or library). Then the price (one tap: $1, $2, $5, $10,
  $20, $50, Free), what it is, and the kind of thing. Clothes get a size (XS–XXL in one tap) and
  a brand. Then the condition, and **Post it**. It remembers the kind of thing you picked last.
  After posting: **Sell another** (opens the camera), **Share / QR code**, or **Post it on
  Facebook too**.
- **Add several** is for clearing out a closet. Pick a pile of photos, type a name and price under
  each, tap "same thing as the one above" for extra angles, then post them all.
- **Items** lists everything. Each item has a QR button (a card with a big QR code you can show
  someone, plus Share and Copy link), and you can edit, mark it sold, hide it, or list it elsewhere.
- **Ring up** is for selling in person: tap what they're buying, then
  - **Cash / Venmo / Other**: recorded, and off the website at once;
  - **They pay on their phone**: a QR code they scan to pay by card or BCH;
  - **Send them a pay link**: the same page as a link to text, held 24 hours (a Marketplace
    buyer can pay before they come by).
- **Print QR signs & tags**: a yard sign with the shop's QR code, and price tags with each
  item's QR code. At the garage sale people scan a tag and pay by card on the spot.
- **Orders**: shows what's paid and waiting for pickup, what's being paid right now, and what's
  done. Mark paid at pickup, mark picked up or shipped, cancel, add notes.
- **Settings**: the shop's name, about text, pickup area (public) and pickup details (only after
  buying), Venmo, shipping, plus a checklist of what's connected.

**Facebook Marketplace, eBay, Nextdoor**: copy the listing text, save the photos, open the site,
and keep the listing's link. See [docs/MARKETPLACES.md](docs/MARKETPLACES.md), which also covers
the plan for posting to eBay from the app.

## Setting it up

1. **The Mac mini**: [docs/MAC_MINI.md](docs/MAC_MINI.md) covers the server, DuckDNS, Caddy,
   launchd and backups, step by step.
2. **Vercel**: the project `personal-garage-sale` needs the settings in [`.env.example`](.env.example):
   `SHOP_API_URL`, the three secrets from the mini, and `ADMIN_PASSWORD`. Then redeploy.
3. **Payments, later**: your personal Stripe keys and your BCH wallet's xPub go in the mini's
   `server/.env` (docs/MAC_MINI.md, section 8). Until then the shop offers pay at pickup, and the
   Sell app records cash and Venmo sales.

Until `SHOP_API_URL` is set, the website shows sample items, so every deploy renders a complete shop.

## Local development

```bash
# The server
cd server && npm ci && npm run setup-env   # set SITE_URL=http://localhost:3000 in .env
npm run dev                                # http://127.0.0.1:8797

# The website (another terminal, in the repo root)
npm install
cp .env.example .env.local                 # SHOP_API_URL=http://127.0.0.1:8797 + the three secrets + ADMIN_PASSWORD
npm run dev                                # http://localhost:3000, Sell app at /sell
```

| Command | Where | What it does |
|---------|-------|--------------|
| `npm run dev` / `build` | root | The website |
| `npm run lint` / `typecheck` | root | ESLint / route types + TypeScript |
| `npm test` | `server/` | Holds, the last one never sold twice, payments, photos, the API, Bitcoin Cash against a stand-in network |

## Project layout

```
src/app/(shop)/          the shop: home, browse, item, about, checkout, order (incl. the BCH payment screen)
src/app/sell/            the Sell app: items, sell, add several, ring up, orders, print, settings
src/app/api/             passes the shop's and the Sell app's requests to the Mac mini; /api/revalidate
src/components/          shop UI; sell/ is the Sell app; bch/ is the payment screen from bch_cashtoken_checkout
src/lib/shop.ts          every request to the Mac mini, and the cached catalog
server/src/              the Mac mini server: store.js (items, holds, orders), app.js (routes),
                         media.js (photos), stripe.js, bch.js (+ bch-engine/), notify.js (emails)
server/scripts/          setup-env, launchd jobs, DuckDNS, backups, update-mini
server/test/             the server's tests
```
