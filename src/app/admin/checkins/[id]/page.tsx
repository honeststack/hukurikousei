import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { FLAG_LABELS, loadPass } from "@/lib/checkin";
import { METHOD_LABEL } from "@/lib/pricing";
import { fmtDate, fmtDateTime, fmtMinutes, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { StatusHanko } from "@/components/status-hanko";
import { READ } from "../../_ctx";
import { adminCancelCheckinAction, resolveFlagsAction } from "../../actions-ops";

export const metadata = { title: "入館の詳細" };

export default async function AdminCheckinPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(READ);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const pass = await loadPass(db, id);
  if (!pass) notFound();
  const { c, facility, member, companyName } = pass;
  const entries = await db.select().from(schema.pointEntries).where(eq(schema.pointEntries.checkinId, c.id)).orderBy(asc(schema.pointEntries.createdAt));
  const logs = await db
    .select()
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.targetType, "checkin"), eq(schema.auditLogs.targetId, c.id)))
    .orderBy(asc(schema.auditLogs.createdAt));
  const [st] = await db
    .select()
    .from(schema.statements)
    .where(and(eq(schema.statements.facilityId, c.facilityId), eq(schema.statements.period, c.period)));
  const canWrite = u.role !== "viewer";
  const methodLabel = c.settlementMethod in METHOD_LABEL ? METHOD_LABEL[c.settlementMethod as keyof typeof METHOD_LABEL] : "精算条件なし";

  return (
    <StaffShell user={u} title="入館の詳細" crumbs={[{ href: "/admin/checkins", label: "入館記録" }]}>
      {c.status === "cancelled" && (
        <p className="notice notice-error">
          {fmtDateTime(c.cancelledAt)} に取り消されました（{c.cancelledByKind === "member" ? "会員" : c.cancelledByKind === "facility" ? "施設" : "運営"}）：{c.cancelReason}
        </p>
      )}
      {c.flags.length > 0 && (
        <section className="panel" style={{ borderColor: c.flagsResolvedAt ? undefined : "var(--shu)" }}>
          <h2>要確認の印</h2>
          <ul style={{ margin: "0 0 8px", paddingLeft: "1.2em" }}>
            {c.flags.map((x) => (
              <li key={x}>
                {FLAG_LABELS[x] ?? x}
                {x === "far" && c.distanceM != null && `（施設から約${num(c.distanceM)}m）`}
              </li>
            ))}
          </ul>
          {c.flagsResolvedAt ? (
            <p className="small mute">
              {fmtDateTime(c.flagsResolvedAt)} 確認済み：{c.flagsResolvedBy}
            </p>
          ) : (
            canWrite && (
              <ActionForm action={resolveFlagsAction}>
                <input type="hidden" name="checkinId" value={c.id} />
                <div className="filters">
                  <label className="field">
                    <span>確認結果のメモ</span>
                    <input name="note" placeholder="例：施設に確認、本人の来館を確認" style={{ minWidth: 320 }} />
                  </label>
                  <SubmitButton className="btn btn-sm">確認済みにする</SubmitButton>
                </div>
              </ActionForm>
            )
          )}
        </section>
      )}

      <div className="grid-2">
        <section className="panel">
          <h2>入館</h2>
          <dl className="kv">
            <dt>会員</dt>
            <dd>
              <Link href={`/admin/members/${member.id}`}>{member.name}</Link>（{companyName}・{member.employeeNo}）
            </dd>
            <dt>施設</dt>
            <dd>
              <Link href={`/admin/facilities/${facility.id}`}>{facility.name}</Link>
            </dd>
            <dt>コース</dt>
            <dd>{c.courseName}</dd>
            <dt>入館日時</dt>
            <dd>{fmtDateTime(c.checkedInAt)}</dd>
            <dt>営業日</dt>
            <dd>{fmtDate(c.businessDate)}</dd>
            <dt>状態</dt>
            <dd>{c.status === "active" ? "有効" : "取消"}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2>料金（入館時点の値）</h2>
          <dl className="kv">
            <dt>必要ポイント</dt>
            <dd>{num(c.pointsRequired)}pt</dd>
            <dt>使用ポイント</dt>
            <dd>{num(c.pointsUsed)}pt（1pt＝{c.yenPerPoint}円）</dd>
            <dt>不足分（店頭）</dt>
            <dd>{yen(c.shortageYen)}</dd>
            <dt>追加料金（店頭）</dt>
            <dd>
              {yen(c.surchargeYen)}
              {c.surchargeDetail.length > 0 && <span className="small mute">（{c.surchargeDetail.map((s) => `${s.label} ${yen(s.amount)}`).join("・")}）</span>}
            </dd>
            {c.stayNotices.length > 0 && (
              <>
                <dt>滞在の予告</dt>
                <dd className="small">{c.stayNotices.map((n) => `${fmtMinutes(n.from)}以降 ${n.label} ${yen(n.amount)}`).join("、")}</dd>
              </>
            )}
            <dt>施設定価</dt>
            <dd>{yen(c.listPrice)}</dd>
            <dt>精算</dt>
            <dd>
              {yen(c.settlementAmount)}
              <span className="small mute">
                （{methodLabel}
                {c.settlementMethod !== "unit" && c.settlementMethod !== "none" && ` ${c.settlementRatioBp / 100}%`}）
              </span>
            </dd>
            <dt>精算明細</dt>
            <dd>
              {st ? (
                <>
                  <Link href={`/admin/settlements/${st.id}`}>{c.period}</Link> <StatusHanko status={st.status} />
                </>
              ) : (
                c.period
              )}
            </dd>
          </dl>
        </section>
      </div>

      <div className="grid-2">
        <section className="panel">
          <h2>端末・位置（不正調査用）</h2>
          <dl className="kv small">
            <dt>端末ID</dt>
            <dd>
              {c.deviceId ? <Link href={`/admin/checkins?from=2000-01-01&device=${c.deviceId}`}>{c.deviceId}</Link> : "—"}
            </dd>
            <dt>通信元</dt>
            <dd>{c.ip || "—"}</dd>
            <dt>ブラウザ</dt>
            <dd style={{ wordBreak: "break-all" }}>{c.userAgent || "—"}</dd>
            <dt>位置</dt>
            <dd>
              {c.lat != null && c.lng != null ? (
                <>
                  <a href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer">
                    {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                  </a>
                  {c.distanceM != null && `（施設から約${num(c.distanceM)}m）`}
                </>
              ) : (
                "取得なし（会員が位置情報を許可していない）"
              )}
            </dd>
          </dl>
        </section>
        <section className="panel">
          <h2>ポイントの動き</h2>
          <table className="daicho">
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDateTime(e.createdAt)}</td>
                  <td>{e.kind === "use" ? "利用" : "取消で戻し"}</td>
                  <td className="r">{num(e.amount)}pt</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td className="empty">ポイントの動きはありません（残高0での入館）</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      {canWrite && c.status === "active" && (
        <section className="panel" style={{ maxWidth: 640 }}>
          <h2>入館の取消</h2>
          <p className="small">ポイントは会員に戻ります。精算が確定済みの月の入館は、当月の精算にマイナスの調整行が入ります（確定帳票は変わりません）。</p>
          <ActionForm action={adminCancelCheckinAction} confirm="この入館を取り消します。よろしいですか？">
            <input type="hidden" name="checkinId" value={c.id} />
            <label className="field">
              <span>理由（必須・操作ログに残ります）</span>
              <input name="reason" required />
            </label>
            <SubmitButton className="btn btn-danger">取り消す</SubmitButton>
          </ActionForm>
        </section>
      )}

      <section className="panel panel-tight">
        <h2>操作の記録</h2>
        <table className="daicho">
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="small">{fmtDateTime(l.createdAt)}</td>
                <td>{l.actorName}</td>
                <td>{l.action}</td>
                <td className="small" style={{ wordBreak: "break-all" }}>
                  {l.detail ? JSON.stringify(l.detail) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
