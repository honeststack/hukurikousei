"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** 読み取った文字列から施設QRのトークン（URLの /q/◯◯）を取り出す。真偽はサーバーで確認する。 */
function tokenFrom(text: string): string | null {
  try {
    const m = /^\/q\/([A-Za-z0-9_-]{8,64})\/?$/.exec(new URL(text, window.location.origin).pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const router = useRouter();
  const [state, setState] = useState<"starting" | "scanning" | "denied" | "unsupported" | "found" | "foreign">("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    let detector: Detector | null = null;
    let jsQR: typeof import("jsqr").default | null = null;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("unsupported");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch {
        setState("denied");
        return;
      }
      if (stopped || !video.current) return;
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);
      const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      if (BD) {
        try {
          detector = new BD({ formats: ["qr_code"] });
        } catch {
          detector = null;
        }
      }
      if (!detector) jsQR = (await import("jsqr")).default;
      setState("scanning");
      loop();
    }

    async function loop() {
      if (stopped) return;
      const v = video.current;
      const c = canvas.current;
      if (v && c && v.readyState >= 2) {
        let text: string | null = null;
        if (detector) {
          const codes = await detector.detect(v).catch(() => []);
          text = codes[0]?.rawValue ?? null;
        } else if (jsQR) {
          const w = Math.min(640, v.videoWidth);
          const h = Math.round((v.videoHeight / v.videoWidth) * w);
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(v, 0, 0, w, h);
            const img = ctx.getImageData(0, 0, w, h);
            text = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
          }
        }
        if (text) {
          const token = tokenFrom(text);
          if (token) {
            setState("found");
            if (navigator.vibrate) navigator.vibrate(60);
            stopped = true;
            stream?.getTracks().forEach((t) => t.stop());
            router.push(`/q/${token}`);
            return;
          }
          setState("foreign");
        }
      }
      timer = window.setTimeout(loop, 180);
    }

    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <>
      <div className="camera">
        <video ref={video} playsInline muted />
        <div className="camera-frame" aria-hidden="true" />
        <canvas ref={canvas} hidden />
      </div>
      <p role="status" style={{ marginTop: 12, textAlign: "center", fontWeight: 700 }}>
        {state === "starting" && "カメラを起動しています…"}
        {state === "scanning" && "受付のQRコードを枠の中に写してください"}
        {state === "found" && "読み取りました。施設を開いています…"}
        {state === "foreign" && "湯札のQRコードではないようです。受付の「湯札」のQRコードを写してください"}
      </p>
      {state === "denied" && (
        <p className="notice notice-error">
          カメラを使えませんでした。ブラウザの設定でカメラを許可するか、スマートフォンのカメラアプリでQRコードを読み取ってください。
        </p>
      )}
      {state === "unsupported" && (
        <p className="notice notice-error">この画面ではカメラを使えません。スマートフォンのカメラアプリでQRコードを読み取ってください。</p>
      )}
    </>
  );
}
