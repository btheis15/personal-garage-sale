import type { Condition, SiteSettings } from "./types";

/** Before the Mac mini has any settings saved (the same defaults as server/src/site.js). */
export const DEFAULT_SETTINGS: SiteSettings = {
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

export const CATEGORIES = [
  { value: "furniture", label: "Furniture" },
  { value: "electronics", label: "Electronics" },
  { value: "home", label: "Home & kitchen" },
  { value: "tools", label: "Tools & garden" },
  { value: "clothing", label: "Clothing & shoes" },
  { value: "kids", label: "Kids & toys" },
  { value: "sports", label: "Sports & outdoors" },
  { value: "media", label: "Books, music & games" },
  { value: "collectibles", label: "Collectibles & art" },
  { value: "auto", label: "Auto & bikes" },
  { value: "other", label: "Other" },
] as const;

export const categoryLabel = (value: string) => CATEGORIES.find((c) => c.value === value)?.label ?? "Other";

export const CONDITIONS: { value: Condition; label: string; hint: string }[] = [
  { value: "new", label: "New", hint: "Never used, may be in the box" },
  { value: "like_new", label: "Like new", hint: "Used a little, no visible wear" },
  { value: "good", label: "Good", hint: "Normal wear, works perfectly" },
  { value: "fair", label: "Fair", hint: "Visible wear or small flaws" },
  { value: "for_parts", label: "For parts / repair", hint: "Doesn't fully work" },
];

export const conditionLabel = (value: string) => CONDITIONS.find((c) => c.value === value)?.label ?? value;

export const PAY_METHOD_LABEL: Record<string, string> = {
  stripe: "Card",
  bch: "Bitcoin Cash",
  cash: "Cash",
  venmo: "Venmo",
  other: "Other",
};

/** Common sizes, one tap each in the Sell app (anything else can be typed). */
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "Kids", "One size"];

export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

export const moneyExact = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
