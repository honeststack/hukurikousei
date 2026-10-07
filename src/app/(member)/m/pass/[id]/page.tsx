import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireMember } from "@/lib/auth";
import { loadPass } from "@/lib/checkin";
import { todayMark } from "@/lib/daily";
import { getSettings } from "@/lib/settings";
import { businessDate, fmtDate, fmtMinutes, fmtTime, num, yen } from "@/lib/time";
import { Elapsed, LiveClock } from "@/components/live-clock";
import { SelfCancel } from "./self-cancel";

export const metadata = { title: "入館証" };

export default async function PassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const member = await requireMember();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const pass = await loadPass(db, id);
  if (!pass || pass.c.memberId !== member.id) notFound();
  const { c, facility } = pass;
  const now = new Date();
  const mark = todayMark(now);
  const isToday = c.businessDate === businessDate(now, facility.daySwitchMinutes);
  const settings = await getSettings(db);
  const cancelUntil = c.checkedInAt.getTime() + settings.selfCancelMinutes * 60 * 1000;
  const payAtDesk = c.shortageYen + c.surchargeYen;
  const cancelled = c.status === "cancelled";

  return (
    <>
      <h1 className="sr-only">入館証</h1>
      {cancelled && (
        <p className="notice notice-error" role="alert">
          この入館は取り消されています（{c.cancelReason}）。
        </p>
      )}
      {!cancelled && !isToday && (
        <p className="notice notice-error" role="alert">
          これは {fmtDate(c.businessDate)} の入館証です。本日の入館には使えません。
        </p>
      )}

      <article className="hanken" style={cancelled || !isToday ? { opacity: 0.55 } : undefined} aria-label="入館証">
        <div className="hanken-top">
          <div className="hanken-ok">{cancelled ? "取消済み" : "入館済み"}</div>
          <div className="hanken-facility">{facility.name}</div>
          <div className="hanken-course">{c.courseName}</div>
          {!cancelled && isToday && (
            <div className="hanken-stamp" aria-label={`本日の印 ${mark.seal}`}>
              <div className="yuge" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <div className="ring">{mark.seal}</div>
            </div>
          )}
        </div>
        <div className="hanken-perf" aria-hidden="true" />
        <div className="hanken-body">
          <div className={`hanken-pay ${payAtDesk === 0 ? "zero" : ""}`}>
            <span style={{ fontWeight: 700 }}>受付でお支払い</span>
            <strong>{yen(payAtDesk)}</strong>
          </div>
          {payAtDesk > 0 && (
            <ul className="small" style={{ margin: "-4px 0 12px", paddingLeft: "1.2em" }}>
              {c.shortageYen > 0 && <li>ポイント不足分 {yen(c.shortageYen)}</li>}
              {c.surchargeDetail.map((s) => (
                <li key={s.label}>
                  {s.label} {yen(s.amount)}
                </li>
              ))}
            </ul>
          )}
          <dl className="hanken-grid">
            <dt>入館</dt>
            <dd>
              {fmtTime(c.checkedInAt)}
              {isToday && !cancelled && (
                <span className="mute" style={{ fontWeight: 400 }}>
                  （<Elapsed since={c.checkedInAt.getTime()} serverNow={now.getTime()} />前）
                </span>
              )}
            </dd>
            <dt>お名前</dt>
            <dd>{member.name}</dd>
            <dt>会社</dt>
            <dd>{member.companyName}</dd>
            <dt>ポイント</dt>
            <dd>{num(c.pointsUsed)}pt 使用</dd>
          </dl>
          {c.stayNotices.map((n) => (
            <p key={n.label} className="small" style={{ margin: "10px 0 0" }}>
              <span className="tag tag-shu">ご注意</span> {fmtMinutes(n.from)}以降もご滞在の場合は {n.label} {yen(n.amount)}
            </p>
          ))}
        </div>
      </article>

      {!cancelled && isToday && <LiveClock serverNow={now.getTime()} />}
      {!cancelled && isToday && (
        <p className="small mute" style={{ textAlign: "center", marginTop: 0 }}>
          この画面を受付のスタッフにお見せください
        </p>
      )}

      {!cancelled && isToday && <SelfCancel checkinId={c.id} until={cancelUntil} serverNow={now.getTime()} />}

      <p style={{ marginTop: 20 }}>
        <Link href="/m">会員証に戻る</Link>
      </p>
    </>
  );
}
