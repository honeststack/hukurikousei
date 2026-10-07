"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 受付のPCで開いたままにする画面を定期的に最新化する（入力中は更新しない） */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = document.activeElement;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");
      const open = document.querySelector("details[open]");
      if (!typing && !open && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => window.clearInterval(id);
  }, [router, seconds]);
  return null;
}
