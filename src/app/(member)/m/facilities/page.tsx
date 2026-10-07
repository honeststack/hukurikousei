import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireMember } from "@/lib/auth";
import { closedReason, dayInfo, facilityInScope, loadRules } from "@/lib/checkin";
import { contractOn } from "@/lib/ledger";
import { computeSurcharges } from "@/lib/pricing";
import { businessDate, jstClockMinutes, yen } from "@/lib/time";

export const metadata = { title: "施設をさがす" };

export default async function FacilitiesPage() {
  const member = await requireMember("/m/facilities");
  const db = await getDb();
  const now = new Date();
  const facilities = await db
    .select()
    .from(schema.facilities)
    .where(eq(schema.facilities.status, "active"))
    .orderBy(asc(schema.facilities.area), asc(schema.facilities.nameKana));
  const rows: { f: (typeof facilities)[number]; closed: string | null; surcharge: ReturnType<typeof computeSurcharges> }[] = [];
  for (const f of facilities) {
    const biz = businessDate(now, f.daySwitchMinutes);
    const contract = await contractOn(db, member.companyId, biz);
    if (!contract || !(await facilityInScope(db, contract, f.id))) continue;
    const info = await dayInfo(db, f.id, biz);
    const closed = closedReason(f, biz, info.closure, info.holidayName);
    const s = computeSurcharges(await loadRules(db, f.id), {
      businessDate: biz,
      clockMinutes: jstClockMinutes(now),
      holidayName: info.holidayName,
      specialDayLabel: info.specialDayLabel,
    });
    rows.push({ f, closed, surcharge: s });
  }
  const areas = [...new Set(rows.map((r) => r.f.area))];

  return (
    <>
      <h1 className="m-h1">施設をさがす</h1>
      <p className="small">ご利用いただける提携施設です（{rows.length}施設）。本日の追加料金と休館を表示しています。</p>
      {areas.map((area) => (
        <section key={area} className="m-section">
          <h2>{area || "その他"}</h2>
          <ul className="list">
            {rows
              .filter((r) => r.f.area === area)
              .map(({ f, closed, surcharge }) => (
                <li key={f.id}>
                  <Link href={`/m/facilities/${f.id}`} className="list-link">
                    <div className="list-row">
                      <b className="mincho" style={{ fontSize: "1.1rem" }}>
                        {f.name}
                      </b>
                      {closed ? <span className="tag tag-mute">本日休館</span> : <span className="tag tag-take">営業日</span>}
                    </div>
                    <div className="small mute">{f.hoursText}</div>
                    {!closed && surcharge.total > 0 && (
                      <div className="small" style={{ color: "var(--shu)", fontWeight: 700 }}>
                        本日 {surcharge.applied.map((a) => `${a.label} +${yen(a.amount)}`).join("・")}
                      </div>
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
