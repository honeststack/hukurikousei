"use client";

import { useEffect, useRef, useState } from "react";

/** 誤タップを防ぐ「スライドして確定」。キーボードでは Enter / Space で確定できる。 */
export function SlideToConfirm({ label, busy, onConfirm }: { label: string; busy?: boolean; onConfirm: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const start = useRef<number | null>(null);
  const KNOB = 52;
  const PAD = 6;

  // 処理が終わって画面に残った場合（エラー時など）は、つまみを左に戻す
  useEffect(() => {
    if (!busy) setX(0);
  }, [busy]);

  const max = () => (track.current ? track.current.clientWidth - KNOB - PAD * 2 : 240);

  function end() {
    if (start.current === null) return;
    start.current = null;
    if (x >= max() * 0.85) {
      setX(max());
      onConfirm();
    } else {
      setX(0);
    }
  }

  return (
    <div className="slide" ref={track} data-busy={busy ? "true" : "false"}>
      <div className="slide-label" aria-hidden="true">
        {busy ? "処理しています…" : label}
      </div>
      <button
        type="button"
        className="slide-knob"
        aria-label={`${label}（Enterキーでも確定できます）`}
        disabled={busy}
        style={{ transform: `translateX(${x}px)`, transition: start.current === null ? "transform 0.2s" : "none" }}
        onPointerDown={(e) => {
          if (busy) return;
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          start.current = e.clientX - x;
        }}
        onPointerMove={(e) => {
          if (start.current === null) return;
          setX(Math.min(max(), Math.max(0, e.clientX - start.current)));
        }}
        onPointerUp={end}
        onPointerCancel={() => {
          start.current = null;
          setX(0);
        }}
        onKeyDown={(e) => {
          if (busy) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setX(max());
            onConfirm();
          }
        }}
      >
        ›
      </button>
    </div>
  );
}
