/**
 * Notifications on Brian's phone (Web Push), straight from this Mac: no outside service besides the
 * phone's own push service (Apple's for an iPhone). The Sell app, opened from its home-screen icon,
 * asks to send notifications (Sell → Settings) and gives this server its subscription. The keys that
 * sign each notification (VAPID) are made on first start and kept in the database.
 *
 * Sent for: something held for pickup, a sale paid online, a hold cancelled by the buyer.
 */
import webpush from "web-push";

export function createPush({ db, config, sender = webpush, now = () => new Date() }) {
  const getMeta = (name) => db.prepare("select value from meta where name = ?").get(name)?.value ?? null;
  let keys = JSON.parse(getMeta("vapid") ?? "null");
  if (!keys) {
    keys = sender.generateVAPIDKeys();
    db.prepare("insert into meta (name, value) values ('vapid', ?)").run(JSON.stringify(keys));
  }
  // Push services want a way to reach whoever sends: the shop's site, or its email.
  const subject = config.siteUrl?.startsWith("https://") ? config.siteUrl : `mailto:${config.smtp?.from || "noreply@example.com"}`;
  sender.setVapidDetails(subject, keys.publicKey, keys.privateKey);

  const list = () => db.prepare("select endpoint, data, label, created_at from push_subscriptions order by created_at").all();

  return {
    publicKey: keys.publicKey,
    count: () => db.prepare("select count(*) as n from push_subscriptions").get().n,
    has: (endpoint) => Boolean(db.prepare("select 1 from push_subscriptions where endpoint = ?").get(String(endpoint ?? ""))),

    /** A phone's subscription (PushSubscription.toJSON()), from the Sell app. */
    subscribe(sub, label = "") {
      const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : "";
      if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string")
        throw Object.assign(new Error("That notification sign-up didn't come through right. Try again."), { status: 400 });
      const data = JSON.stringify({ endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
      db.prepare("insert into push_subscriptions (endpoint, data, label, created_at) values (?, ?, ?, ?) on conflict(endpoint) do update set data = excluded.data, label = excluded.label").run(
        endpoint,
        data,
        String(label).slice(0, 80),
        now().toISOString(),
      );
      return { ok: true };
    },
    unsubscribe(endpoint) {
      db.prepare("delete from push_subscriptions where endpoint = ?").run(String(endpoint ?? ""));
      return { ok: true };
    },

    /** To every phone signed up: { title, body, url (a Sell app page), tag (same tag replaces the last one) }. */
    async send({ title, body, url = "/sell/orders", tag }) {
      const payload = JSON.stringify({ title, body, url, tag });
      let sent = 0;
      for (const row of list()) {
        try {
          await sender.sendNotification(JSON.parse(row.data), payload, { TTL: 24 * 3600, urgency: "high" });
          sent++;
        } catch (e) {
          // 404/410: the phone turned notifications off or the app was removed; forget it.
          if (e?.statusCode === 404 || e?.statusCode === 410) db.prepare("delete from push_subscriptions where endpoint = ?").run(row.endpoint);
          else console.error(`[push] ${e?.statusCode ?? ""} ${e?.body ?? e?.message ?? e}`.trim());
        }
      }
      return { sent };
    },
  };
}
