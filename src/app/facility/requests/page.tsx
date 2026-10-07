import { desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilitiesFor } from "@/lib/scope";
import { fmtDateTime, fmtShortDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { changeRequestAction } from "../actions";

export const metadata = { title: "変更・取消の申請" };

const STATE = { open: ["申請中", "hanko-ai"], done: ["反映済み", "hanko-take"], approved: ["取消済み", "hanko-take"], rejected: ["見送り", "hanko-mute"] } as const;

export default async function FacilityRequestsPage() {
  const u = await requireStaff(["facility"]);
  const facilities = await facilitiesFor(u);
  const ids = facilities.map((f) => f.id);
  const db = await getDb();
  const changes = ids.length
    ? await db.select().from(schema.changeRequests).where(inArray(schema.changeRequests.facilityId, ids)).orderBy(desc(schema.changeRequests.createdAt))
    : [];
  const cancels = ids.length
    ? await db
        .select({ r: schema.cancelRequests, c: schema.checkins })
        .from(schema.cancelRequests)
        .innerJoin(schema.checkins, eq(schema.checkins.id, schema.cancelRequests.checkinId))
        .where(inArray(schema.checkins.facilityId, ids))
        .orderBy(desc(schema.cancelRequests.createdAt))
    : [];
  const fname = (id: string) => facilities.find((f) => f.id === id)?.name ?? "";

  return (
    <StaffShell user={u} title="変更・取消の申請">
      <div className="grid-2">
        <section className="panel">
          <h2>料金・営業情報の変更を申請</h2>
          <ActionForm action={changeRequestAction} resetOnOk>
            <label className="field">
              <span>施設</span>
              <select name="facilityId" required>
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>種類</span>
              <select name="category">
                <option>料金・コースの変更</option>
                <option>追加料金（土日祝・深夜など）の変更</option>
                <option>営業時間の変更</option>
                <option>臨時休館</option>
                <option>特別料金日（GW・お盆・年末年始など）</option>
                <option>その他</option>
              </select>
            </label>
            <label className="field">
              <span>適用日</span>
              <input type="date" name="effectiveOn" />
            </label>
            <label className="field">
              <span>内容</span>
              <textarea name="body" required placeholder="例：11月1日から「入浴のみ」の施設価格を1,350円→1,400円に改定します" />
            </label>
            <SubmitButton>運営に申請する</SubmitButton>
          </ActionForm>
        </section>
        <section className="panel">
          <h2>申請の状況</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>申請日</th>
                <th>内容</th>
                <th>状態</th>
              </tr>
            </thead>
            <tbody>
              {changes.length + cancels.length === 0 && (
                <tr>
                  <td colSpan={3} className="empty">
                    申請はありません
                  </td>
                </tr>
              )}
              {changes.map((r) => (
                <tr key={r.id}>
                  <td className="small">{fmtDateTime(r.createdAt)}</td>
                  <td>
                    <b>{r.category}</b>（{fname(r.facilityId)}
                    {r.effectiveOn && `・${fmtShortDate(r.effectiveOn)}から`}）
                    <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                      {r.body}
                    </div>
                    {r.resolutionNote && <div className="small mute">運営より：{r.resolutionNote}</div>}
                  </td>
                  <td>
                    <span className={`hanko ${STATE[r.status][1]}`}>{STATE[r.status][0]}</span>
                  </td>
                </tr>
              ))}
              {cancels.map(({ r, c }) => (
                <tr key={r.id}>
                  <td className="small">{fmtDateTime(r.createdAt)}</td>
                  <td>
                    <b>入館の取消</b>（{fname(c.facilityId)}・{fmtShortDate(c.businessDate)}・{c.courseName}）
                    <div className="small">{r.reason}</div>
                    {r.resolutionNote && <div className="small mute">運営より：{r.resolutionNote}</div>}
                  </td>
                  <td>
                    <span className={`hanko ${STATE[r.status][1]}`}>{STATE[r.status][0]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </StaffShell>
  );
}
