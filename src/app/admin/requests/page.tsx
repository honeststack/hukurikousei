import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime, fmtShortDate, num } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { resolveCancelRequestAction, resolveChangeRequestAction } from "../actions-ops";

export const metadata = { title: "施設からの申請" };

export default async function RequestsPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const cancels = await db
    .select({ r: schema.cancelRequests, c: schema.checkins, facilityName: schema.facilities.name, memberName: schema.members.name })
    .from(schema.cancelRequests)
    .innerJoin(schema.checkins, eq(schema.checkins.id, schema.cancelRequests.checkinId))
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .orderBy(desc(schema.cancelRequests.createdAt))
    .limit(100);
  const changes = await db
    .select({ r: schema.changeRequests, facilityName: schema.facilities.name })
    .from(schema.changeRequests)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.changeRequests.facilityId))
    .orderBy(desc(schema.changeRequests.createdAt))
    .limit(100);
  const canWrite = u.role !== "viewer";
  const openCancels = cancels.filter((x) => x.r.status === "open");
  const openChanges = changes.filter((x) => x.r.status === "open");

  return (
    <StaffShell user={u} title="施設からの申請">
      <section className="panel panel-tight">
        <h2>入館の取消申請（未対応 {openCancels.length}件）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>申請日時</th>
              <th>施設</th>
              <th>入館</th>
              <th>理由</th>
              <th>対応</th>
            </tr>
          </thead>
          <tbody>
            {cancels.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  申請はありません
                </td>
              </tr>
            )}
            {cancels.map(({ r, c, facilityName, memberName }) => (
              <tr key={r.id}>
                <td className="small">{fmtDateTime(r.createdAt)}</td>
                <td>{facilityName}</td>
                <td>
                  <Link href={`/admin/checkins/${c.id}`}>
                    {fmtShortDate(c.businessDate)} {memberName}
                  </Link>
                  <div className="small mute">
                    {c.courseName}・{num(c.pointsUsed)}pt
                  </div>
                </td>
                <td>{r.reason}</td>
                <td style={{ minWidth: 280 }}>
                  {r.status === "open" && canWrite ? (
                    <ActionForm action={resolveCancelRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <input name="note" placeholder="施設への返信（見送る場合は必須）" className="input" style={{ minHeight: 36, marginBottom: 6 }} />
                      <div className="row-actions">
                        <SubmitButton className="btn btn-sm btn-danger" name="decision" value="approve">
                          取り消す
                        </SubmitButton>
                        <SubmitButton className="btn btn-sm" name="decision" value="reject">
                          見送る
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  ) : (
                    <span className="small">
                      {r.status === "open" ? "未対応" : r.status === "approved" ? "取消済み" : "見送り"}
                      {r.resolvedBy && `（${r.resolvedBy}）`}
                      {r.resolutionNote && `：${r.resolutionNote}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel panel-tight">
        <h2>料金・営業情報の変更申請（未対応 {openChanges.length}件）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>申請日時</th>
              <th>施設</th>
              <th>内容</th>
              <th>対応</th>
            </tr>
          </thead>
          <tbody>
            {changes.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  申請はありません
                </td>
              </tr>
            )}
            {changes.map(({ r, facilityName }) => (
              <tr key={r.id}>
                <td className="small">{fmtDateTime(r.createdAt)}</td>
                <td>
                  <Link href={`/admin/facilities/${r.facilityId}`}>{facilityName}</Link>
                </td>
                <td>
                  <b>{r.category}</b>
                  {r.effectiveOn && <span className="small">（{fmtShortDate(r.effectiveOn)}から）</span>}
                  <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                    {r.body}
                  </div>
                </td>
                <td style={{ minWidth: 280 }}>
                  {r.status === "open" && canWrite ? (
                    <ActionForm action={resolveChangeRequestAction}>
                      <input type="hidden" name="requestId" value={r.id} />
                      <p className="small" style={{ margin: "0 0 4px" }}>
                        施設の設定画面で反映してから「反映済み」にしてください。
                      </p>
                      <input name="note" placeholder="施設への返信（任意）" className="input" style={{ minHeight: 36, marginBottom: 6 }} />
                      <div className="row-actions">
                        <SubmitButton className="btn btn-sm btn-go" name="decision" value="done">
                          反映済み
                        </SubmitButton>
                        <SubmitButton className="btn btn-sm" name="decision" value="reject">
                          見送る
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  ) : (
                    <span className="small">
                      {r.status === "open" ? "未対応" : r.status === "done" ? "反映済み" : "見送り"}
                      {r.resolvedBy && `（${r.resolvedBy}）`}
                      {r.resolutionNote && `：${r.resolutionNote}`}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
