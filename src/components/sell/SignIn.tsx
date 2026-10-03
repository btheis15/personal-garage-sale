"use client";

import Image from "next/image";
import { useState } from "react";

export function SignIn({ ready }: { ready: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/sell/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) return window.location.reload();
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't sign in.");
    setBusy(false);
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 text-center">
        <Image src="/icon.png" alt="" width={72} height={72} className="mx-auto rounded-2xl" priority />
        <h1 className="text-3xl">Sell</h1>
        {ready ? (
          <>
            <input type="password" autoComplete="current-password" autoFocus required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="field text-center" />
            {error && <p className="text-sm font-bold text-berry">{error}</p>}
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-xs text-muted">Tip: add this page to your home screen (Share → Add to Home Screen) and it opens like an app.</p>
          </>
        ) : (
          <p className="rounded-xl bg-sun p-4 text-left text-sm">
            Set <code>ADMIN_PASSWORD</code> (8 or more characters) in Vercel → Settings → Environment Variables, then redeploy. See the README.
          </p>
        )}
      </form>
    </div>
  );
}
