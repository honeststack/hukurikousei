"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlideToConfirm } from "@/components/slide-confirm";

type Course = {
  id: string;
  name: string;
  includes: string;
  durationText: string;
  points: number;
  listPrice: number;
  pointsUsed: number;
  shortageYen: number;
};
type Line = { label: string; amount: number };
type Stay = Line & { from: number };

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;
const pt = (n: number) => `${n.toLocaleString("ja-JP")}pt`;
const hm = (m: number) => `${Math.floor((m % 1440) / 60)}時${String(m % 60).padStart(2, "0")}分`;

function newKey(): string {
  // randomUUID は https / localhost でのみ使える
  if (typeof crypto.randomUUID === "function" && window.isSecureContext) return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** 位置情報は、すでに許可されている場合だけ取得する（受付で許可を求めるダイアログを出さない） */
async function quietLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!navigator.permissions || !navigator.geolocation) return null;
    const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    if (p.state !== "granted") return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 3000, maximumAge: 120000 },
      );
    });
  } catch {
    return null;
  }
}

export function CoursePicker({
  qrToken,
  balance,
  courses,
  surcharges,
  stayNotices,
  facilityName,
}: {
  qrToken: string;
  balance: number;
  courses: Course[];
  surcharges: Line[];
  stayNotices: Stay[];
  facilityName: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef<string>("");
  const surchargeTotal = surcharges.reduce((s, x) => s + x.amount, 0);

  function open(c: Course) {
    setSelected(c);
    setError(null);
    key.current = newKey();
  }

  async function confirm() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const loc = await quietLocation();
    try {
      const res = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrToken,
          courseId: selected.id,
          idempotencyKey: key.current,
          expectedPayAtDesk: selected.shortageYen + surchargeTotal,
          lat: loc?.lat ?? null,
          lng: loc?.lng ?? null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok: boolean; checkinId?: string; message?: string; code?: string } | null;
      if (data?.ok && data.checkinId) {
        router.replace(`/m/pass/${data.checkinId}`);
        return;
      }
      if (data?.code === "already" && data.checkinId) {
        router.replace(`/m/pass/${data.checkinId}`);
        return;
      }
      if (data?.code === "changed") {
        setSelected(null);
        router.refresh();
      }
      setError(data?.message ?? "まだ入館していません。もう一度お試しください");
    } catch {
      // 通信できなかった場合は同じ確認番号のまま再試行できる（二重に消費されない）
      setError("通信できませんでした。まだ入館していません。電波の良い場所でもう一度スライドしてください");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {surcharges.length > 0 ? (
        <div className="kakefuda" role="note" aria-label="本日の追加料金">
          <div className="kakefuda-head">本日の追加料金</div>
          {surcharges.map((s) => (
            <div className="kakefuda-row" key={s.label}>
              <span>{s.label}</span>
              <span className="amt num">+{yen(s.amount)}</span>
            </div>
          ))}
          <div className="kakefuda-note">追加料金はポイントでは払えません。受付でお支払いください。</div>
        </div>
      ) : (
        <p className="small" style={{ margin: "0 0 12px" }}>
          本日の追加料金はありません。
        </p>
      )}
      {stayNotices.map((n) => (
        <p key={n.label} className="small" style={{ margin: "0 0 12px" }}>
          <span className="tag tag-shu">ご注意</span> {hm(n.from)}以降もご滞在の場合は、{n.label} {yen(n.amount)} を受付でお支払いください。
        </p>
      ))}

      <p style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "4px 0 8px" }}>
        <b>コースを選んでください</b>
        <span className="small">
          のこり <b className="num">{pt(balance)}</b>
        </span>
      </p>
      <div className="kenbaiki" role="group" aria-label="コース">
        {courses.map((c) => (
          <button key={c.id} type="button" className="ken" aria-pressed={selected?.id === c.id} onClick={() => open(c)}>
            <span className="ken-name">{c.name}</span>
            <span className="ken-pt">
              {pt(c.points)}
              <small>施設価格 {yen(c.listPrice)}</small>
            </span>
            <span className="ken-sub">
              {[c.includes, c.durationText].filter(Boolean).join("／")}
              {c.shortageYen > 0 && (
                <>
                  <br />
                  <span className="kofuda">差額 {yen(c.shortageYen)} を受付で</span>
                </>
              )}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" onClick={() => !busy && setSelected(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h2 id="sheet-title" className="mincho" style={{ fontSize: "1.3rem", marginBottom: 2 }}>
              {facilityName}
            </h2>
            <p style={{ fontWeight: 700, fontSize: "1.1rem", margin: 0 }}>{selected.name}</p>
            <table className="sum-table">
              <tbody>
                <tr>
                  <th>ポイントで支払い</th>
                  <td className="num">{pt(selected.pointsUsed)}</td>
                </tr>
                {selected.shortageYen > 0 && (
                  <tr>
                    <th>ポイント不足分</th>
                    <td className="num shu">{yen(selected.shortageYen)}</td>
                  </tr>
                )}
                {surcharges.map((s) => (
                  <tr key={s.label}>
                    <th>{s.label}</th>
                    <td className="num shu">{yen(s.amount)}</td>
                  </tr>
                ))}
                <tr className="total">
                  <th>受付でお支払い</th>
                  <td className={`num ${selected.shortageYen + surchargeTotal > 0 ? "shu" : ""}`}>{yen(selected.shortageYen + surchargeTotal)}</td>
                </tr>
              </tbody>
            </table>
            <p className="small mute" style={{ marginTop: -6 }}>
              入館後ののこり {pt(balance - selected.pointsUsed)}
            </p>
            {error && (
              <p className="notice notice-error" role="alert">
                {error}
              </p>
            )}
            <SlideToConfirm label="スライドして入館" busy={busy} onConfirm={confirm} />
            <button type="button" className="btn btn-block" style={{ marginTop: 12 }} disabled={busy} onClick={() => setSelected(null)}>
              コースを選び直す
            </button>
          </div>
        </div>
      )}
    </>
  );
}
