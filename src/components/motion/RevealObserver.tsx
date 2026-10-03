"use client";

import { useEffect } from "react";

/**
 * Adds `is-visible` to every `[data-reveal]` element as it scrolls into view.
 * One observer serves the whole site; new elements (after navigation) are
 * picked up by a MutationObserver. Styles live in globals.css.
 */
export function RevealObserver() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    const scan = (root: ParentNode) =>
      root.querySelectorAll<HTMLElement>("[data-reveal]:not(.is-visible)").forEach((el) => {
        if (reduce) el.classList.add("is-visible");
        else io.observe(el);
      });
    scan(document);
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches("[data-reveal]")) {
              if (reduce) n.classList.add("is-visible");
              else io.observe(n);
            }
            scan(n);
          }
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}
