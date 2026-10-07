"use client";

import { useEffect, useState } from "react";

const WD = ["日", "月", "火", "水", "木", "金", "土"];
const pad = (n: number) => String(n).padStart(2, "0");

function parts(ms: number) {
  const t = new Date(ms + 9 * 3600 * 1000);
  return {
    hm: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
    s: pad(t.getUTCSeconds()),
    date: `${t.getUTCFullYear()}年${t.getUTCMonth() + 1}月${t.getUTCDate()}日（${WD[t.getUTCDay()]}）`,
  };
}

/** サーバー時刻に合わせて秒まで動く時計（端末の時計がずれていても正しい時刻を出す） */
export function LiveClock({ serverNow }: { serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const tick = () => setNow(Date.now() + offset);
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [serverNow]);
  const p = parts(now);
  return (
    <div className="clock" aria-live="off">
      <div className="clock-time">
        {p.hm}
        <span className="mute">:</span>
        <span className="clock-sec">{p.s}</span>
      </div>
      <div className="clock-date">{p.date}</div>
    </div>
  );
}

/** 入館からの経過時間 */
export function Elapsed({ since, serverNow }: { since: number; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);
  const min = Math.max(0, Math.floor((now - since) / 60000));
  const h = Math.floor(min / 60);
  return <>{h > 0 ? `${h}時間${min % 60}分` : `${min}分`}</>;
}

/** 残り秒数のカウントダウン。0になったら子要素を隠す。 */
export function Countdown({ until, serverNow, children }: { until: number; serverNow: number; children: (sec: number) => React.ReactNode }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const offset = serverNow - Date.now();
    const id = window.setInterval(() => setNow(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [serverNow]);
  const sec = Math.ceil((until - now) / 1000);
  if (sec <= 0) return null;
  return <>{children(sec)}</>;
}
