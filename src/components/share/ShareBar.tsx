"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { CopyLink } from "./CopyLink";
import { savedCode, subscribeCode } from "./shared";

/** On an item page, for a friend signed up on this device: their own link for this item. */
export function ShareBar({ title }: { title: string }) {
  const code = useSyncExternalStore(subscribeCode, savedCode, () => null);
  const path = usePathname();
  if (!code) return null;
  return (
    <div className="animate-rise mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-light bg-sun/40 p-3 text-sm">
      <span className="mr-auto">
        <span className="font-bold">Know someone who&apos;d want this?</span> <span className="text-muted">Your link earns you a cut.</span>
      </span>
      <CopyLink text={`${window.location.origin}${path}?s=${code}`} label="Copy my link" share={title} />
    </div>
  );
}
