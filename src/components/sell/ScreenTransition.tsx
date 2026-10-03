"use client";

import { usePathname } from "next/navigation";

/** Each Sell app screen slides in as you switch tabs. */
export function ScreenTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div key={path} className="animate-screen-in">
      {children}
    </div>
  );
}
