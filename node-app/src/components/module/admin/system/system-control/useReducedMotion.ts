/**
 * @docHint
 * @purpose Read the user's reduced-motion preference for admin system-control feedback
 * @process Observe the media query, update React state on preference changes, and remove the listener on cleanup
 * @domain admin-system
 * @scope hook
 */
"use client";

import { useEffect, useState } from "react";

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return reducedMotion;
}
