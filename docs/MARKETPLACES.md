# Facebook Marketplace and eBay

What's ready now, and the plan for posting to other sites straight from the Sell app.

## Ready now

Every item has a **List it elsewhere too** section in the Sell app (open the item):

- **Copy listing text**: title, price, condition, description, and a link to buy it on your site.
- **Save the photos**: on iPhone this opens the share sheet (Save Images, or share straight to the
  Facebook app); on a computer it downloads them.
- **Open ↗** opens Marketplace's, eBay's, Nextdoor's or Craigslist's "new listing" page.
- **Paste the listing's link** and Save. It's kept with the item (`channels` on the item, in the Mac mini's database):
  - The item page in your shop shows "Also on Facebook Marketplace" with the link.
  - The Items list shows "FB" / "eBay" next to it.
  - When it sells on your site (or you mark it sold), the Items list reminds you to mark it sold
    on those sites too, for two weeks.

So one item, photographed once, goes to all of them in a minute or two.

## Facebook Marketplace: why it's by hand

Meta doesn't let apps post personal Marketplace listings. Its APIs only cover business catalogs
(Commerce Manager), which list as a shop, need a Facebook Page and business verification, and
don't show up the way a neighbour's listing does. The copy/save/open flow above is the fastest
route that keeps your listings personal. If that changes, the `channels.facebook` field is where
an automatic listing's ID would go.

## eBay: the plan for posting from the Sell app

eBay's **Sell APIs** do allow it. Steps when you're ready:

1. **Developer account** at developer.ebay.com (free). Create an app: you get a Client ID, a
   Client Secret and a RuName (the OAuth redirect name). Start in the Sandbox.
2. **Business policies** on your eBay account (payment, return, fulfillment). Listings created by
   API must reference them. Set them once in eBay → Account → Business policies.
3. **Connect your account**: a "Connect eBay" button in Sell → Settings sends you through eBay's
   OAuth (scope `https://api.ebay.com/oauth/api_scope/sell.inventory`); the refresh token is kept
   on the Mac mini (encrypted, like Om Threads' Etsy keys).
4. **Post an item** ("List on eBay" on the item):
   - `PUT /sell/inventory/v1/inventory_item/{sku}` with the title, description, condition
     (our conditions map to eBay's: new → NEW, like_new → USED_EXCELLENT, good → USED_GOOD,
     fair → USED_ACCEPTABLE, for_parts → FOR_PARTS_OR_NOT_WORKING), the photo URLs (the shop's
     own `/media/…` addresses work as is) and quantity. The SKU is the item's id.
   - `POST /sell/inventory/v1/offer` with the price, category (eBay's category suggestion API
     from the title), and the three policy IDs; then `POST /offer/{offerId}/publish`.
   - Save the listing ID and URL in `channels.ebay`.
5. **Keep them in step**:
   - Sold here → `DELETE /offer/{offerId}` (ends the eBay listing).
   - Sold on eBay → eBay's notification (Marketplace Account / order notifications) to a new
     `/api/ebay/notify` route that marks the item sold here. A check of
     `GET /sell/fulfillment/v1/order` every few minutes on the mini catches any missed.
6. eBay charges its usual final value fee on eBay sales.

It would live on the Mac mini, next to Stripe: a new `server/src/ebay.js`, its keys in the
mini's `.env`, a "List on eBay" button on the item in the Sell app, and the "sold here → end the
eBay listing" step in `markPaid()` (`server/src/store.js`). Items already carry everything eBay
asks for.
