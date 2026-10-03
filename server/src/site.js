/** Lists and defaults shared by the server (the website has its own copy in src/lib/site.ts). */
export const DEFAULT_SETTINGS = {
  name: "Brian's Garage Sale",
  tagline: "Things from around our house that we don't need anymore.",
  about:
    "Hi, I'm Brian. We live in town with our family, and like every family we end up with more stuff than we need. Everything here is ours, priced to go to a good home. Most things are pickup from our driveway; you can pay online by card or Bitcoin Cash, or hold it and pay when you come by.",
  pickupArea: "Local pickup (set your area in Sell → Settings)",
  pickupInstructions: "I'll send you our address and we'll find a time that works. Usually evenings and weekends.",
  contactEmail: "",
  contactPhone: "",
  payAtPickup: true,
  payAtPickupHours: 48,
  venmo: "",
  shipping: false,
  defaultShippingCents: 1000,
  announcement: "",
};

export const CATEGORIES = ["furniture", "electronics", "home", "tools", "clothing", "kids", "sports", "media", "collectibles", "auto", "other"];
export const CONDITIONS = ["new", "like_new", "good", "fair", "for_parts"];
export const STATUSES = ["draft", "live", "sold", "hidden"];
export const CHANNELS = ["facebook", "ebay", "craigslist", "offerup", "nextdoor"];

/** How long a card or Bitcoin Cash checkout holds the items (Stripe's shortest session is 30 minutes). */
export const CHECKOUT_HOLD_MINUTES = 35;
/** How long an in-person QR checkout or a shared pay link holds the items. */
export const IN_PERSON_HOLD_MINUTES = 30;
/** Sold items stay in the shop (as Sold) this long. */
export const SOLD_SHOWN_DAYS = 14;

export const PAY_METHOD_LABEL = { stripe: "Card", bch: "Bitcoin Cash", cash: "Cash", venmo: "Venmo", other: "Other" };

export function slugify(title) {
  return (
    String(title)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

export const moneyText = (cents) => `$${(cents / 100).toFixed(2)}`;
