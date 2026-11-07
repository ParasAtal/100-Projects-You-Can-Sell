"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page every few seconds so the owner sees workers start/finish live. */
export default function AutoRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
