// A stand-in for Shippo: records every call, answers with rates a test can change.
export const TEST_KEY = "shippo_test_abcdef1234567890";
export const LIVE_KEY = "shippo_live_abcdef1234567890";

const rate = (id, provider, name, token, amount, days) => ({ object_id: id, provider, servicelevel: { name, token }, amount, currency: "USD", estimated_days: days });

export const USUAL_RATES = () => [
  rate("r_ground", "USPS", "Ground Advantage", "usps_ground_advantage", "5.25", 3),
  rate("r_prio", "USPS", "Priority Mail", "usps_priority", "9.85", 2),
  rate("r_express", "USPS", "Priority Mail Express", "usps_priority_express", "31.00", 1),
  rate("r_ups", "UPS", "Ground", "ups_ground", "8.00", 4),
];

export function fakeShippo() {
  const state = { rates: USUAL_RATES(), shipments: [], buys: [], keysUsed: [], failShipment: null, buy: "ok", labelsForRate: [] };
  const makeShippo = (token) => {
    state.keysUsed.push(token);
    return {
      async createShipment(body) {
        state.shipments.push(body);
        state.onShipment?.(body);
        if (state.failShipment) throw Object.assign(new Error(state.failShipment.message), { status: state.failShipment.status });
        return { object_id: `shp_${state.shipments.length}`, rates: state.rates, messages: [] };
      },
      async buyLabel(rateId, metadata) {
        state.buys.push({ rateId, metadata, token });
        if (state.buy === "lost") throw Object.assign(new Error("Couldn't reach Shippo"), { lost: true });
        if (state.buy === "fail") throw Object.assign(new Error("Insufficient funds"), { status: 400 });
        return { object_id: `tx_${state.buys.length}`, status: "SUCCESS", label_url: "https://shippo.test/label.pdf", tracking_number: "9400111899223197428490", tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223197428490", test: token.startsWith("shippo_test_") };
      },
      async labelsForRate() {
        return { results: state.labelsForRate };
      },
    };
  };
  return { state, makeShippo };
}
