import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { todayMark } from "@/lib/daily";
import { facilitiesFor } from "@/lib/scope";
import { businessDate, fmtDate, fmtTime, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FacilityPicker } from "@/components/facility-picker";
import { StaffShell } from "@/components/staff-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { facilityCancelAction } from "./actions";

export const metadata = { title: "本日の入館" };

const familyName = (name: string) => name.split(/\s|　/)[0];

export default async function FacilityTodayPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const u = await requireStaff(["facility"]);
  const facilities = await facilitiesFor(u);
  const { f } = await searchParams;
  const db = await getDb();
  // 複数店舗の担当者は、直近に入館があった店舗を最初に表示する
  const [latest] = facilities.length
    ? await db
        .select({ facilityId: schema.checkins.facilityId })
        .from(schema.checkins)
        .where(inArray(schema.checkins.facilityId, facilities.map((x) => x.id)))
        .orderBy(desc(schema.checkins.checkedInAt))
        .limit(1)
    : [];
  const facility = facilities.find((x) => x.id === f) ?? facilities.find((x) => x.id === latest?.facilityId) ?? facilities[0];
  if (!facility) {
    return (
      <StaffShell user={u} title="本日の入館">
        <p className="notice notice-error">担当する施設が登録されていません。運営にお問い合わせください。</p>
      </StaffShell>
    );
  }
  const now = new Date();
  const biz = businessDate(now, facility.daySwitchMinutes);
  const rows = await db
    .select({ c: schema.checkins, memberName: schema.members.name, companyName: schema.companies.name })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .where(and(eq(schema.checkins.facilityId, facility.id), eq(schema.checkins.businessDate, biz)))
    .orderBy(desc(schema.checkins.checkedInAt));
  const active = rows.filter((r) => r.c.status === "active");
  const desk = active.reduce((s, r) => s + r.c.shortageYen + r.c.surchargeYen, 0);
  const mark = todayMark(now);

  return (
    <StaffShell user={u} title="本日の入館" actions={<span className="small mute">1分ごとに自動で更新します</span>}>
      <AutoRefresh seconds={60} />
      <FacilityPicker facilities={facilities} current={facility.id} basePath="/facility" />
      <div className="stats">
        <div className="stat">
          <div className="stat-label">営業日</div>
          <div className="stat-value" style={{ fontSize: "1.15rem" }}>
            {fmtDate(biz)}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">入館</div>
          <div className="stat-value">
            {num(active.length)}
            <small>人</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">受付で受け取る額（合計）</div>
          <div className="stat-value">{yen(desk)}</div>
        </div>
        <div className="stat" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              background: mark.color.hex,
              color: mark.color.ink,
              display: "grid",
              placeItems: "center",
              fontFamily: "var(--font-mincho)",
              fontWeight: 700,
              fontSize: "1.3rem",
            }}
          >
            {mark.seal}
          </span>
          <div>
            <div className="stat-label">本日の入館証の色と印</div>
            <div style={{ fontWeight: 700 }}>
              {mark.color.name}・{mark.seal}
            </div>
          </div>
        </div>
      </div>
      <p className="small mute">
        会員の入館証は、上の色と印で表示され、時計が秒まで動いています。色が違う・時計が止まっている画面は受け付けないでください。
      </p>

      <section className="panel panel-tight">
        <h2>入館の一覧（新しい順）</h2>
        <div className="table-wrap">
          <table className="daicho">
            <thead>
              <tr>
                <th>入館</th>
                <th>お名前</th>
                <th>会社</th>
                <th>コース</th>
                <th className="r">ポイント</th>
                <th className="r">受付で受け取る額</th>
                <th>状態</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    本日の入館はまだありません
                  </td>
                </tr>
              )}
              {rows.map(({ c, memberName, companyName }) => (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td className="num">{fmtTime(c.checkedInAt)}</td>
                  <td>{familyName(memberName)} 様</td>
                  <td>{companyName}</td>
                  <td>{c.courseName}</td>
                  <td className="r">{num(c.pointsUsed)}</td>
                  <td className="r">
                    {yen(c.shortageYen + c.surchargeYen)}
                    {c.shortageYen + c.surchargeYen > 0 && (
                      <div className="small mute">
                        {[c.shortageYen ? `不足 ${yen(c.shortageYen)}` : "", ...c.surchargeDetail.map((s) => `${s.label} ${yen(s.amount)}`)]
                          .filter(Boolean)
                          .join("・")}
                      </div>
                    )}
                  </td>
                  <td>{c.status === "cancelled" ? <span className="hanko hanko-shu">取消</span> : <span className="hanko hanko-take">入館</span>}</td>
                  <td>
                    {c.status === "active" && (
                      <details>
                        <summary className="btn btn-sm btn-danger" style={{ listStyle: "none" }}>
                          取消
                        </summary>
                        <ActionForm action={facilityCancelAction} confirm="この入館を取り消します。よろしいですか？">
                          <input type="hidden" name="checkinId" value={c.id} />
                          <label className="field" style={{ marginTop: 8, minWidth: 220 }}>
                            <span>理由</span>
                            <input name="reason" required placeholder="例：コースの選び間違い" />
                          </label>
                          <SubmitButton className="btn btn-sm btn-danger">取り消す</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="small mute">取り消せるのは本日の営業日の入館だけです。前日以前の取消は「入館の履歴」から運営に申請してください。</p>
    </StaffShell>
  );
}
