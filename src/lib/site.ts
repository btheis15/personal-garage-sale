import type { Condition, SiteSettings } from "./types";

export const DEFAULT_SETTINGS: SiteSettings = {
  name: "Brian's Garage Sale",
  tagline: "Good stuff, fair prices, local pickup.",
  about:
    "Everything here is mine: things I no longer use, priced to move. Most items are pickup only. Pay online with a card or Bitcoin Cash, or hold it and pay when you pick it up.",
  pickupArea: "Near me: set your area in Sell → Settings",
  pickupInstructions: "I'll email you to set up a pickup time. Please reply with a time that works for you.",
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

/** How long a card or Bitcoin Cash checkout holds the items (Stripe's shortest session is 30 minutes). */
export const CHECKOUT_HOLD_MINUTES = 35;
/** How long an in-person QR checkout holds the items while the buyer pays on their phone. */
export const IN_PERSON_HOLD_MINUTES = 20;

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

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}
