"use client";

import { useEffect } from "react";

/** Komt iemand binnen via een verwijslink (?ref=CODE), dan onthouden we de code 30 dagen voor bij het aanmaken van zijn account. */
export function VerwijsCookie({ code }: { code: string }) {
  useEffect(() => {
    const schoon = code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 12);
    if (schoon) window.document.cookie = `sp_ref=${schoon}; path=/; max-age=2592000; samesite=lax`;
  }, [code]);
  return null;
}
