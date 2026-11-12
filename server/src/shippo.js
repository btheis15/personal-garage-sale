/**
 * Shipping labels through Shippo (discounted USPS, UPS and DHL rates). A test token (shippo_test_…)
 * makes free sample labels; a live one buys real postage. Ported from Om Threads' client (same
 * Shippo account), minus customs: the garage sale ships inside the US only.
 *
 * Shippo API (2018-02-08): shipments, labels via POST /transactions with a rate,
 * GET /transactions?rate= to find a label whose answer was lost.
 */
export const SHIPPO_API = "https://api.goshippo.com";

export const shippoKeyMode = (key) => (/^shippo_test_\w{10,}$/.test(key) ? "test" : /^shippo_live_\w{10,}$/.test(key) ? "live" : null);

export class ShippoError extends Error {
  constructor(message, { status = null, lost = false } = {}) {
    super(message);
    this.status = status;
    this.lost = lost;
  }
}

/** Shippo's errors come in several shapes: { detail }, { field: [messages] }, or messages[]. */
function errorText(data) {
  if (!data || typeof data !== "object") return null;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.messages) && data.messages.length) return data.messages.map((m) => m.text).filter(Boolean).join(" ");
  const parts = [];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) parts.push(`${k.replace(/_/g, " ")}: ${v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")}`);
    else if (v && typeof v === "object") {
      const inner = errorText(v);
      if (inner) parts.push(`${k.replace(/_/g, " ")}: ${inner}`);
    }
  }
  return parts.join("; ") || null;
}

export function createShippo({ token, fetchImpl = fetch, base = SHIPPO_API }) {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Authorization: `ShippoToken ${token}`,
          "SHIPPO-API-VERSION": "2018-02-08",
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) {
      throw new ShippoError(`Couldn't reach Shippo (${e.message}).`, { lost: method !== "GET" });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ShippoError(errorText(data) || `Shippo answered ${res.status}.`, { status: res.status, lost: res.status >= 500 && method !== "GET" });
    return data;
  }
  return {
    /** Checks the token (lists one carrier account). */
    ping: () => call("GET", "/carrier_accounts?results=1"),
    createShipment: (body) => call("POST", "/shipments", { ...body, async: false }),
    buyLabel: (rateId, metadata) => call("POST", "/transactions", { rate: rateId, label_file_type: "PDF_4x6", async: false, metadata }),
    labelsForRate: (rateId) => call("GET", `/transactions?rate=${encodeURIComponent(rateId)}`),
  };
}

/** Tracking page for a carrier and number (labels bought elsewhere). */
export function trackingUrl(carrier, number) {
  const n = encodeURIComponent(number);
  switch (String(carrier).toLowerCase()) {
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "ups":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "dhl":
    case "dhl_express":
      return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${n}`;
    default:
      return null;
  }
}
