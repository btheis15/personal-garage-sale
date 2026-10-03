"use client";

import { useSyncExternalStore } from "react";

const nothing = () => () => {};

/** This site's address in the browser ("" while rendering on the server), without a hydration mismatch. */
export const useOrigin = () =>
  useSyncExternalStore(
    nothing,
    () => window.location.origin,
    () => "",
  );
