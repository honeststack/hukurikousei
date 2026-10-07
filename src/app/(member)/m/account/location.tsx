"use client";

import { useEffect, useState } from "react";

/** 位置情報の利用許可。入館時は許可済みの場合だけ送信する。 */
export function LocationPermission() {
  const [state, setState] = useState<"unknown" | "granted" | "denied" | "prompt" | "unsupported">("unknown");
  useEffect(() => {
    if (!navigator.geolocation) {
      setState("unsupported");
      return;
    }
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((p) => {
        setState(p.state as "granted" | "denied" | "prompt");
        p.onchange = () => setState(p.state as "granted" | "denied" | "prompt");
      })
      .catch(() => setState("prompt"));
  }, []);

  if (state === "unsupported") return <p className="small mute">この端末では位置情報を使えません。</p>;
  if (state === "granted") return <p className="small">位置情報の利用を許可しています。入館の確認に使われます。</p>;
  if (state === "denied")
    return <p className="small">位置情報は許可されていません。許可する場合は、ブラウザの設定から変更してください。</p>;
  return (
    <button
      type="button"
      className="btn btn-block"
      onClick={() => navigator.geolocation.getCurrentPosition(() => setState("granted"), () => setState("denied"), { timeout: 10000 })}
    >
      位置情報の利用を許可する
    </button>
  );
}
