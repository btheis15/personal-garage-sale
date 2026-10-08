"use client";

import { useEffect } from "react";
import { PARTNER_COOKIE, PARTNER_DAYS, partnerCodeOk } from "@/lib/partner-ref";

/** Remembers a friend's "Spread the word" link (?s=<code>) for 30 days, so a later Bitcoin Cash checkout credits them. */
export function PartnerRef() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("s");
    if (partnerCodeOk(code)) document.cookie = `${PARTNER_COOKIE}=${encodeURIComponent(code.toLowerCase())}; Max-Age=${PARTNER_DAYS * 86400}; Path=/; SameSite=Lax; Secure`;
  }, []);
  return null;
}
