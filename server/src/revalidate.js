/**
 * Tells the website to refresh after a change, so edits appear within
 * seconds. Saves are batched: several edits in quick succession send one
 * request. Without it the site still picks up changes within 5 minutes.
 */
export function createRevalidator(config, { delayMs = 2000, retryMs = 30_000, fetchImpl = fetch } = {}) {
  const enabled = Boolean(config.siteUrl && config.revalidateSecret);
  let timer = null;
  let status = enabled
    ? { state: "idle", at: null, message: "No changes yet." }
    : { state: "disabled", at: null, message: "SITE_URL / REVALIDATE_SECRET are not set, so the site refreshes every 5 minutes on its own." };

  async function send(attempt = 1) {
    status = { state: "pending", at: new Date().toISOString(), message: "Updating the website…" };
    try {
      const res = await fetchImpl(`${config.siteUrl}/api/revalidate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.revalidateSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "garage-sale-server" }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`the website answered ${res.status}`);
      status = { state: "ok", at: new Date().toISOString(), message: "Website is up to date." };
    } catch (e) {
      console.error(`[revalidate] attempt ${attempt} failed:`, e.message);
      if (attempt < 2) {
        timer = setTimeout(() => send(attempt + 1), retryMs);
        status = { state: "pending", at: new Date().toISOString(), message: "Website didn't answer. Trying again shortly…" };
      } else {
        status = {
          state: "error",
          at: new Date().toISOString(),
          message: `Couldn't reach the website (${e.message}). Your change is saved and will appear within 5 minutes.`,
        };
      }
    }
  }

  return {
    schedule() {
      if (!enabled) return;
      clearTimeout(timer);
      status = { state: "pending", at: new Date().toISOString(), message: "Updating the website…" };
      timer = setTimeout(() => send(), delayMs);
    },
    now() {
      if (!enabled) return Promise.resolve();
      clearTimeout(timer);
      return send();
    },
    status: () => status,
    stop: () => clearTimeout(timer),
  };
}
