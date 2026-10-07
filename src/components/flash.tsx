"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

/** ?flash= の結果メッセージを表示し、URLからは消しておく（再読み込みで再表示しない） */
export function Flash() {
  const sp = useSearchParams();
  const message = sp.get("flash");
  const kind = sp.get("fk") === "error" ? "error" : "ok";
  const [shown, setShown] = useState<{ message: string; kind: string } | null>(null);
  useEffect(() => {
    if (!message) return;
    setShown({ message, kind });
    const url = new URL(window.location.href);
    url.searchParams.delete("flash");
    url.searchParams.delete("fk");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, [message, kind]);
  const m = message ? { message, kind } : shown;
  if (!m) return null;
  return (
    <p className={`notice ${m.kind === "error" ? "notice-error" : "notice-ok"}`} role="status">
      {m.message}
    </p>
  );
}
