export type Condition = "new" | "like_new" | "good" | "fair" | "for_parts";
export type ItemStatus = "draft" | "live" | "sold" | "hidden";

export type Photo = {
  /** The photo's id on the Mac mini (none for the sample drawings). */
  id?: string;
  /** /media/<id>/<maxWidth>.webp, served through the website's own address. */
  url: string;
  width: number;
  height: number;
  /** The largest copy the Mac mini made (smaller ones: 320, 480, 640, 828, 1080, 1280, 1600). */
  maxWidth?: number;
};

/** Where else an item is listed (Facebook Marketplace, eBay…), recorded in the Sell app. */
export type ChannelListing = { url?: string; listedAt?: string; id?: string };
export type Channels = Partial<Record<"facebook" | "ebay" | "craigslist" | "offerup" | "nextdoor", ChannelListing>>;

export type Item = {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  compareAtCents: number | null;
  condition: Condition;
  category: string;
  /** Clothing and shoes: "M", "10.5", "Boys 8"… */
  size: string;
  brand: string;
  photos: Photo[];
  status: ItemStatus;
  /** How many are left (lowered while a checkout holds them). */
  quantity: number;
  /** A checkout is paying for the last one(s) until then. */
  heldUntil: string | null;
  obo: boolean;
  pickup: boolean;
  ships: boolean;
  shippingCents: number | null;
  featured: boolean;
  channels: Channels;
  notes: string;
  soldAt: string | null;
  soldVia: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** What the shop shows: an item without its private notes. */
export type PublicItem = Omit<Item, "notes">;

/** Whether the shop can sell it right now. */
export type Availability = "available" | "on_hold" | "sold";

export type OrderStatus = "pending" | "reserved" | "paid" | "completed" | "cancelled" | "expired";
export type PayMethod = "stripe" | "bch" | "cash" | "venmo" | "other";

export type OrderLine = { id: string; slug?: string; title: string; priceCents: number; qty: number; photo?: string | null };

/** What the buyer's order page shows (no private notes). */
export type BuyerOrder = {
  id: string;
  number: number;
  status: OrderStatus;
  method: PayMethod | null;
  channel: "web" | "in_person";
  items: (OrderLine & { photoUrl: string | null })[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  fulfillment: "pickup" | "ship";
  holdUntil: string | null;
  paidAt: string | null;
  name: string | null;
};

/** Which ways to pay the Mac mini has switched on. */
export type Payments = { stripe: boolean; stripeTest: boolean; bch: boolean };

export type Customer = {
  name?: string;
  email?: string;
  phone?: string;
  note?: string;
  address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } | null;
};

export type Order = {
  id: string;
  number: number;
  status: OrderStatus;
  method: PayMethod | null;
  channel: "web" | "in_person";
  items: OrderLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  fulfillment: "pickup" | "ship";
  customer: Customer;
  stripeSessionId: string | null;
  holdUntil: string | null;
  paidAt: string | null;
  completedAt: string | null;
  notes: string;
  createdAt: string;
};

export type SiteSettings = {
  /** The shop's name, e.g. "Brian's Garage Sale". */
  name: string;
  tagline: string;
  /** A paragraph or two about the sale, on the home and About pages. */
  about: string;
  /** Shown before buying: the general area, never the street address. */
  pickupArea: string;
  /** Shown only after an order is paid or reserved: address, times, how to reach you. */
  pickupInstructions: string;
  contactEmail: string;
  contactPhone: string;
  /** "Pay at pickup" at checkout (cash, Venmo…), with the items held this many hours. */
  payAtPickup: boolean;
  payAtPickupHours: number;
  /** e.g. "@brian-t" — shown with the Venmo option. */
  venmo: string;
  /** Shipping for items that allow it (each item can set its own price). */
  shipping: boolean;
  defaultShippingCents: number;
  /** A line across the top of the shop, e.g. "Garage sale Saturday 8–2!" (blank: none). */
  announcement: string;
};
