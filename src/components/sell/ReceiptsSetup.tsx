"use client";

import { useEffect, useState } from "react";
import { sellApi } from "./api";

type Status = {
  hotWallet: { address: string; balance: { bch: string; sats: number } | null } | null;
  receipts: {
    wallet: boolean;
    registryHost: string | null;
    collection: { name: string; icon: string | null; registryUrl: string; createdUrl: string | null; issued: number; updating: boolean } | null;
  } | null;
};

/** Wallet receipts (CashTokens): the hot wallet's balance, and making the receipt collection once. */
export function ReceiptsSetup({ hotWallet }: { hotWallet: boolean }) {
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hotWallet) return;
    sellApi<Status>("GET", "/api/sell/receipts").then(setSt, (e) => setError((e as Error).message));
  }, [hotWallet]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await sellApi("POST", "/api/sell/receipts", {});
      setSt(await sellApi<Status>("GET", "/api/sell/receipts"));
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  const c = st?.receipts?.collection;
  return (
    <section className="mt-10">
      <h2 className="text-xl">Wallet receipts</h2>
      <p className="text-sm text-muted">
        Bitcoin Cash buyers can take their receipt as a CashToken: a one-of-a-kind receipt in their wallet with what they bought and what they paid. It&apos;s
        made and sent from the hot wallet (a fraction of a cent each).
      </p>
      <div className="mt-3 space-y-3 rounded-2xl border border-line bg-white p-4 text-sm">
        {!hotWallet ? (
          <p>Needs the hot wallet first: see “BCH hot wallet” under Setup.</p>
        ) : !st ? (
          <p className="flex items-center gap-2 text-muted">
            <span className="pulse-dot size-2 rounded-full bg-amber" /> Checking the hot wallet…
          </p>
        ) : (
          <>
            {st.hotWallet && (
              <p>
                <span className="font-bold">Hot wallet:</span> {st.hotWallet.balance ? `${st.hotWallet.balance.bch} BCH` : "balance unavailable right now"}
                <span className="block break-all text-muted">{st.hotWallet.address}</span>
                {st.hotWallet.balance && st.hotWallet.balance.sats < 20_000 && <span className="mt-1 block font-bold text-berry">Running low: send it about 0.001 BCH.</span>}
              </p>
            )}
            {c ? (
              <p className="animate-rise">
                <span className="font-bold text-leaf">✓ {c.name}</span> · {c.issued} sent so far{c.updating ? " · updating" : ""}
                <span className="block text-muted">Buyers paying with Bitcoin Cash now get the choice at checkout.</span>
                {c.createdUrl && (
                  <a href={c.createdUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-tag-dark underline">
                    See it on the blockchain ↗
                  </a>
                )}
              </p>
            ) : (
              <>
                <p>Make your receipt collection once. It&apos;s named after the shop and uses the little receipt picture.</p>
                <button type="button" onClick={create} disabled={busy} className="btn btn-primary w-full">
                  {busy ? "Making it…" : "Set up wallet receipts"}
                </button>
              </>
            )}
          </>
        )}
        {error && <p className="rounded-xl bg-berry/10 p-3 font-bold text-berry">{error}</p>}
      </div>
    </section>
  );
}
