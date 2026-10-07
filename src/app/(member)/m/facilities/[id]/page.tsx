import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireMember } from "@/lib/auth";
import { closedReason, dayInfo, loadRules } from "@/lib/checkin";
import { isEffective, resolvePrice, weekdayMaskLabel } from "@/lib/pricing";
import { businessDate, fmtDate, fmtMinutes, fmtShortDate, num, WEEKDAYS_JA, yen } from "@/lib/time";

export const metadata = { title: "施設のご案内" };

export default async function FacilityPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, id));
  if (!f || f.status !== "active") notFound();
  const now = new Date();
  const biz = businessDate(now, f.daySwitchMinutes);
  const courses = await db
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.facilityId, f.id), eq(schema.courses.active, true)))
    .orderBy(asc(schema.courses.sort));
  const prices = courses.length
    ? await db.select().from(schema.coursePrices).where(inArray(schema.coursePrices.courseId, courses.map((c) => c.id)))
    : [];
  const rules = (await loadRules(db, f.id)).filter((r) => isEffective(r, biz));
  const closures = await db
    .select()
    .from(schema.facilityClosures)
    .where(and(eq(schema.facilityClosures.facilityId, f.id), gte(schema.facilityClosures.date, biz)))
    .orderBy(asc(schema.facilityClosures.date))
    .limit(5);
  const info = await dayInfo(db, f.id, biz);
  const closed = closedReason(f, biz, info.closure, info.holidayName);
  const closedDays = WEEKDAYS_JA.filter((_, i) => f.closedWeekdays & (1 << i));
  const mapUrl = f.lat != null && f.lng != null ? `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(f.address)}`;

  return (
    <>
      <p className="small mute" style={{ margin: 0 }}>
        {f.area}
      </p>
      <h1 className="m-h1">{f.name}</h1>
      <p className={`notice ${closed ? "notice-error" : "notice-ok"}`}>
        {fmtDate(biz)}：{closed ?? "営業日です"}
      </p>
      {f.description && <p>{f.description}</p>}

      <section className="m-section">
        <h2>コースと必要ポイント</h2>
        <ul className="list">
          {courses.map((c) => {
            const p = resolvePrice(prices.filter((x) => x.courseId === c.id), biz);
            if (!p) return null;
            return (
              <li key={c.id}>
                <div className="list-row">
                  <b>{c.name}</b>
                  <b className="num">{num(p.points)}pt</b>
                </div>
                <div className="small mute">
                  {[c.includes, c.durationText, `施設価格 ${yen(p.listPrice)}`].filter(Boolean).join("／")}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {rules.length > 0 && (
        <section className="m-section">
          <h2>追加料金（受付でお支払い）</h2>
          <ul className="list">
            {rules.map((r) => {
              const days = [weekdayMaskLabel(r.weekdays), r.onHoliday ? "祝日" : "", r.onSpecialDay ? "特別料金日" : ""].filter(Boolean).join("・");
              const time = r.timeFrom != null && r.timeTo != null ? `${fmtMinutes(r.timeFrom)}〜${fmtMinutes(r.timeTo)}` : "";
              return (
                <li key={r.id} className="list-row">
                  <span>
                    {r.label}
                    <span className="small mute">
                      （{days}
                      {time && ` ${r.kind === "stay" ? `${fmtMinutes(r.timeFrom)}以降のご滞在` : `${time}のご入館`}`}）
                    </span>
                  </span>
                  <b className="num" style={{ color: "var(--shu)" }}>
                    +{yen(r.amount)}
                  </b>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="m-section">
        <h2>営業案内</h2>
        <dl className="kv small">
          <dt>営業時間</dt>
          <dd>{f.hoursText}</dd>
          <dt>定休日</dt>
          <dd>
            {closedDays.length ? `${closedDays.join("・")}曜日${f.openOnHolidays ? "（祝日は営業）" : ""}` : "なし"}
          </dd>
          {closures.length > 0 && (
            <>
              <dt>臨時休館</dt>
              <dd>{closures.map((c) => `${fmtShortDate(c.date)}${c.note ? ` ${c.note}` : ""}`).join("、")}</dd>
            </>
          )}
          <dt>住所</dt>
          <dd>
            {f.address}{" "}
            <a href={mapUrl} target="_blank" rel="noopener noreferrer">
              地図
            </a>
          </dd>
          {f.phone && (
            <>
              <dt>電話</dt>
              <dd>
                <a href={`tel:${f.phone.replace(/[^0-9+]/g, "")}`}>{f.phone}</a>
              </dd>
            </>
          )}
          {f.notes && (
            <>
              <dt>備考</dt>
              <dd>{f.notes}</dd>
            </>
          )}
        </dl>
      </section>
      <p style={{ marginTop: 20 }}>
        <Link href="/m/facilities">施設一覧に戻る</Link>
      </p>
    </>
  );
}
