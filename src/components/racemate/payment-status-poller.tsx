"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PaymentStatusPoller() {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 15) window.clearInterval(timer);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return null;
}
