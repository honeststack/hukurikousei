import Link from "next/link";
import { and, eq, isNull, like } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireMember } from "@/lib/auth";
import { todaysCheckin } from "@/lib/checkin";
import { todayMark } from "@/lib/daily";
import { balanceOf } from "@/lib/ledger";
import { ensureRollover, noticesFor } from "@/lib/member-view";
import { memberStatus } from "@/lib/members";
import { fmtTime, jstDate, lastDayOf, num, periodOf } from "@/lib/time";
import { LiveClock } from "@/components/live-clock";

export const metadata = { title: "会員証" };

export default async function CardPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  const member = await requireMember("/m");
  const now = new Date();
  await ensureRollover(member.id, now);
  const db = await getDb();
  const balance = await balanceOf(db, member.id);
  const today = jstDate(now);
  const status = memberStatus(member, today);
  const visit = await todaysCheckin(db, member.id, now);
  const mark = todayMark(now);
  const notices = await noticesFor(member, now, 1);
  const end = lastDayOf(periodOf(today));
  // 公開デモでは、受付のQRポスターの代わりに施設のQRのリンクを出す
  const demoQrs =
    process.env.DEMO_MODE === "true"
      ? await db
          .select({ token: schema.facilityQrs.token, name: schema.facilities.name })
          .from(schema.facilityQrs)
          .innerJoin(schema.facilities, eq(schema.facilities.id, schema.facilityQrs.facilityId))
          .where(and(like(schema.facilityQrs.token, "demo-%"), isNull(schema.facilityQrs.revokedAt)))
      : [];

  return (
    <>
      <h1 className="sr-only">会員証</h1>
      {cancelled && !visit && (
        <p className="notice notice-ok" role="status">
          入館を取り消し、ポイントを戻しました。もう一度QRを読み取ってコースを選び直せます。
        </p>
      )}
      <div className="mcard" aria-label="会員証">
        <span className="mcard-ribbon" aria-hidden="true" />
        <div className="mcard-head">
          <span className="en">Yufuda Membership</span>
          <span className="mcard-seal" aria-label={`本日の印 ${mark.seal}`}>
            {mark.seal}
          </span>
        </div>
        <div className="mcard-company">{member.companyName}</div>
        <div className="mcard-name">{member.name}</div>
        <div className="mcard-foot">
          <div>
            <div className="mcard-cap">のこりポイント</div>
            <div className="mcard-points">
              {num(balance)}
              <small>pt</small>
            </div>
          </div>
          <div className="mcard-exp">
            {Number(end.slice(5, 7))}月{Number(end.slice(8))}日まで有効
          </div>
        </div>
      </div>

      <LiveClock serverNow={now.getTime()} />

      {status === "stopped" && <p className="notice notice-error">この会員証は利用停止になっています。</p>}
      {status === "not_started" && (
        <p className="notice">ご利用は {member.startsOn.replace(/-/g, "/")} からです。</p>
      )}

      <div className="action-stack">
        {visit ? (
          <>
            <Link href={`/m/pass/${visit.c.id}`} className="btn btn-go btn-block btn-big">
              本日の入館証を表示
            </Link>
            <p className="small mute" style={{ textAlign: "center", margin: 0 }}>
              {visit.facility.name}（{fmtTime(visit.c.checkedInAt)} 入館）。入館は1日1回までです。
            </p>
          </>
        ) : (
          status !== "stopped" && (
            <>
              <Link href="/m/scan" className="btn btn-primary btn-block btn-big">
                受付のQRを読み取って入館
              </Link>
              <p className="small mute" style={{ textAlign: "center", margin: 0 }}>
                スマートフォンのカメラでQRを読み取っても開けます
              </p>
              {demoQrs.length > 0 && (
                <div className="card small">
                  <div className="en" style={{ color: "var(--brass-deep)" }}>
                    Demo
                  </div>
                  <b>受付のQRコードを読み取ったことにする</b>
                  <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                    {demoQrs.map((q) => (
                      <Link key={q.token} href={`/q/${q.token}`} className="btn btn-sm">
                        {q.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>

      {notices[0] && (
        <div className="m-section">
          <h2>お知らせ</h2>
          <Link href="/m/notices" className="card" style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <b>{notices[0].title}</b>
            <div className="small mute">すべてのお知らせを見る ›</div>
          </Link>
        </div>
      )}

      <div className="m-section">
        <h2>使い方</h2>
        <ol className="small" style={{ paddingLeft: "1.3em", margin: 0 }}>
          <li>施設の受付にあるQRコードを読み取ります</li>
          <li>コースを選び、本日の追加料金を確かめて「スライドして入館」</li>
          <li>表示された入館証を受付に見せます。差額や追加料金は受付でお支払いください</li>
        </ol>
        <p className="small" style={{ marginTop: 8 }}>
          <Link href="/m/guide">くわしい使い方（ホーム画面への追加方法）</Link>
        </p>
      </div>
    </>
  );
}
