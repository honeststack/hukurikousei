import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilitiesFor } from "@/lib/scope";
import { addDays, businessDate, fmtDateTime, fmtShortDate, isValidYmd, jstDate, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FacilityPicker } from "@/components/facility-picker";
import { StaffShell } from "@/components/staff-shell";
import { cancelRequestAction } from "../actions";

export const metadata = { title: "入館の履歴" };

export default async function FacilityHistoryPage({ searchParams }: { searchParams: Promise<{ f?: string; from?: string; to?: string }> }) {
  const u = await requireStaff(["facility"]);
  const facilities = await facilitiesFor(u);
  const sp = await searchParams;
  const facility = facilities.find((x) => x.id === sp.f) ?? facilities[0];
  const today = jstDate(new Date());
  const to = sp.to && isValidYmd(sp.to) ? sp.to : today;
  const from = sp.from && isValidYmd(sp.from) ? sp.from : addDays(to, -30);
  if (!facility) return <StaffShell user={u} title="入館の履歴">担当施設がありません</StaffShell>;
  const db = await getDb();
  const rows = await db
    .select({ c: schema.checkins, memberName: schema.members.name, companyName: schema.companies.name })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .where(and(eq(schema.checkins.facilityId, facility.id), gte(schema.checkins.businessDate, from), lte(schema.checkins.businessDate, to)))
    .orderBy(desc(schema.checkins.checkedInAt))
    .limit(2000);
  const requests = await db.select().from(schema.cancelRequests);
  const bizToday = businessDate(new Date(), facility.daySwitchMinutes);
  const active = rows.filter((r) => r.c.status === "active");

  return (
    <StaffShell user={u} title="入館の履歴">
      <FacilityPicker facilities={facilities} current={facility.id} basePath="/facility/history" extra={`&from=${from}&to=${to}`} />
      <form className="filters" method="get">
        <input type="hidden" name="f" value={facility.id} />
        <label className="field">
          <span>営業日（から）</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>（まで）</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <button className="btn btn-sm" type="submit">
          表示
        </button>
        <span className="small mute">
          {num(active.length)}件・受付収受 {yen(active.reduce((s, r) => s + r.c.shortageYen + r.c.surchargeYen, 0))}
        </span>
      </form>
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>営業日</th>
              <th>入館</th>
              <th>お名前</th>
              <th>会社</th>
              <th>コース</th>
              <th className="r">ポイント</th>
              <th className="r">受付収受</th>
              <th>状態</th>
              <th>取消申請</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="empty">
                  この期間の入館はありません
                </td>
              </tr>
            )}
            {rows.map(({ c, memberName, companyName }) => {
              const req = requests.filter((r) => r.checkinId === c.id).sort((a, b) => +b.createdAt - +a.createdAt)[0];
              return (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td>{fmtShortDate(c.businessDate)}</td>
                  <td className="num">{fmtDateTime(c.checkedInAt).slice(11)}</td>
                  <td>{memberName.split(/\s|　/)[0]} 様</td>
                  <td>{companyName}</td>
                  <td>{c.courseName}</td>
                  <td className="r">{num(c.pointsUsed)}</td>
                  <td className="r">{yen(c.shortageYen + c.surchargeYen)}</td>
                  <td>{c.status === "cancelled" ? <span className="hanko hanko-shu">取消</span> : <span className="hanko hanko-take">入館</span>}</td>
                  <td>
                    {req?.status === "open" && <span className="hanko hanko-ai">申請中</span>}
                    {req?.status === "rejected" && (
                      <span className="small" title={req.resolutionNote ?? ""}>
                        却下：{req.resolutionNote}
                      </span>
                    )}
                    {c.status === "active" && req?.status !== "open" && c.businessDate !== bizToday && (
                      <details>
                        <summary className="btn btn-sm" style={{ listStyle: "none" }}>
                          申請する
                        </summary>
                        <ActionForm action={cancelRequestAction}>
                          <input type="hidden" name="checkinId" value={c.id} />
                          <label className="field" style={{ marginTop: 8, minWidth: 220 }}>
                            <span>理由</span>
                            <input name="reason" required placeholder="例：入館せずにお帰りになった" />
                          </label>
                          <SubmitButton className="btn btn-sm btn-primary">運営に申請</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                    {c.status === "active" && c.businessDate === bizToday && <span className="small mute">本日分は「本日の入館」から取消</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
