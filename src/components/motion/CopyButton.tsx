"use client";

import { useRef, useState } from "react";

/** Copy: "Copied" rolls up into place, the button turns green and a tick draws itself. */
export function CopyButton({ text, label = "Copy link", className = "btn btn-outline" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      prompt("Copy this:", text);
      return;
    }
    setDone(false);
    requestAnimationFrame(() => setDone(true));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1800);
  }
  return (
    <button type="button" onClick={copy} className={`copy-roll ${className} ${done ? "done" : ""}`} aria-label={done ? "Copied" : label}>
      <span className="face idle">{label}</span>
      <span className="face ok" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
        Copied
      </span>
    </button>
  );
}
