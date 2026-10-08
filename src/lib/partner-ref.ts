/**
 * "Spread the word" links (?s=<code>): the code is kept in a cookie for 30 days and sent with a
 * Bitcoin Cash checkout so the friend who shared it earns their commission. It only says who sent
 * the buyer: prices are always the same.
 */
export const PARTNER_COOKIE = "garage-sale-friend";
export const PARTNER_DAYS = 30;
export const partnerCodeOk = (code: unknown): code is string => typeof code === "string" && /^[a-z0-9-]{3,40}$/i.test(code);
