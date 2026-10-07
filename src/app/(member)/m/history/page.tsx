import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireMember } from "@/lib/auth";
import { balanceOf } from "@/lib/ledger";
import { ensureRollover } from "@/lib/member-view";
import { addMonths, currentPeriod, fmtDateTime, fmtPeriod, fmtShortDate, isValidPeriod, num } from "@/lib/time";

export const metadata = { title: "利用の記録" };

const KIND: Record<string, string> = {
  grant: "付与",
  use: "利用",
  refund: "取消で戻し",
  expire: "失効",
  revoke: "利用停止",
  adjust: "調整",
};

/** 施設名の最後の語（「天然温泉 みなと湯」→「みなと湯」）を印に使う */
const short = (name: string) => name.split(/\s|　/).filter(Boolean).pop() ?? name;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const member = await requireMember("/m/history");
  await ensureRollover(member.id);
  const { p } = await searchParams;
  const cur = currentPeriod();
  const period = p && isValidPeriod(p) && p <= cur ? p : cur;
  const db = await getDb();
  const visits = await db
    .select({ c: schema.checkins, facilityName: schema.facilities.name })
    .from(schema.checkins)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .where(and(eq(schema.checkins.memberId, member.id), eq(schema.checkins.period, period)))
    .orderBy(desc(schema.checkins.checkedInAt));
  const entries = (
    await db
      .select()
      .from(schema.pointEntries)
      .where(and(eq(schema.pointEntries.memberId, member.id), eq(schema.pointEntries.period, period)))
      .orderBy(desc(schema.pointEntries.createdAt))
  ).filter((e) => e.amount !== 0);
  const balance = await balanceOf(db, member.id);
  const active = visits.filter((v) => v.c.status === "active");
  const slots = Math.max(8, Math.ceil((active.length + 1) / 4) * 4);

  return (
    <>
      <h1 className="m-h1">湯めぐり帳</h1>
      <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }} aria-label="月の切り替え">
        <Link href={`/m/history?p=${addMonths(period, -1)}`} className="btn btn-sm">
          ‹ 前の月
        </Link>
        <b className="mincho" style={{ fontSize: "1.15rem" }}>
          {fmtPeriod(period)}
        </b>
        {period < cur ? (
          <Link href={`/m/history?p=${addMonths(period, 1)}`} className="btn btn-sm">
            次の月 ›
          </Link>
        ) : (
          <span style={{ width: 84 }} />
        )}
      </nav>

      <div className="stamps" aria-label={`${fmtPeriod(period)}の入館 ${active.length}回`}>
        {Array.from({ length: slots }, (_, i) => {
          const v = active[active.length - 1 - i];
          return v ? (
            <Link key={v.c.id} href={`/m/pass/${v.c.id}`} className="stamp" style={{ textDecoration: "none" }} title={v.facilityName}>
              <small>{fmtShortDate(v.c.businessDate).replace(/（.）/, "")}</small>
              <b style={{ fontSize: short(v.facilityName).length > 3 ? "0.85rem" : undefined }}>{short(v.facilityName)}</b>
            </Link>
          ) : (
            <div key={`e${i}`} className="stamp stamp-empty" aria-hidden="true" />
          );
        })}
      </div>
      <p className="small" style={{ marginTop: 8 }}>
        {fmtPeriod(period)}は <b>{active.length}回</b> 入館しました。現在ののこり <b className="num">{num(balance)}pt</b>
      </p>

      <section className="m-section">
        <h2>入館</h2>
        {visits.length === 0 ? (
          <p className="small mute">この月の入館はありません。</p>
        ) : (
          <ul className="list">
            {visits.map((v) => (
              <li key={v.c.id}>
                <Link href={`/m/pass/${v.c.id}`} className="list-link">
                  <div className="list-row">
                    <b>{v.facilityName}</b>
                    <span className="num">{num(v.c.pointsUsed)}pt</span>
                  </div>
                  <div className="list-row small mute">
                    <span>
                      {fmtDateTime(v.c.checkedInAt)}・{v.c.courseName}
                    </span>
                    {v.c.status === "cancelled" && <span className="tag tag-shu">取消</span>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="m-section">
        <h2>ポイントの出入り</h2>
        {entries.length === 0 ? (
          <p className="small mute">この月の記録はありません。</p>
        ) : (
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="list-row">
                  <span>
                    <span className={`tag ${e.amount > 0 ? "tag-take" : "tag-mute"}`}>{KIND[e.kind]}</span> {e.note}
                  </span>
                  <b className={`num ${e.amount > 0 ? "plus" : "minus"}`}>
                    {e.amount > 0 ? "+" : "−"}
                    {num(Math.abs(e.amount))}
                  </b>
                </div>
                <div className="small mute">{fmtDateTime(e.createdAt)}</div>
              </li>
            ))}
          </ul>
        )}
        <p className="small mute" style={{ marginTop: 8 }}>
          ポイントは毎月1日に付与され、月末に失効します（ご契約により繰越できる場合があります）。
        </p>
      </section>
    </>
  );
}
