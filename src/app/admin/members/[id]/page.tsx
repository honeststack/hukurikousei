import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { balanceOf, ledgerOf } from "@/lib/ledger";
import { MEMBER_STATUS_LABEL, memberStatus } from "@/lib/members";
import { fmtDateTime, jstDate, num } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MemberFields } from "@/components/member-fields";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../../_ctx";
import { adminMemberOpAction, adminUpdateMemberAction } from "../../actions-org";

export const metadata = { title: "会員の詳細" };

const KIND: Record<string, string> = { grant: "付与", use: "利用", refund: "取消戻し", expire: "失効", revoke: "停止で無効化", adjust: "手動調整" };

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(READ);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ m: schema.members, companyName: schema.companies.name })
    .from(schema.members)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.members.companyId))
    .where(eq(schema.members.id, id));
  if (!row) notFound();
  const m = row.m;
  const today = jstDate(new Date());
  const balance = await balanceOf(db, m.id);
  const ledger = (await ledgerOf(db, m.id, 100)).filter((e) => e.amount !== 0);
  const visits = await db
    .select({ c: schema.checkins, facilityName: schema.facilities.name })
    .from(schema.checkins)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .where(eq(schema.checkins.memberId, m.id))
    .orderBy(desc(schema.checkins.checkedInAt))
    .limit(30);
  const sessions = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.subjectKind, "member"), eq(schema.sessions.subjectId, m.id), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())))
    .orderBy(desc(schema.sessions.lastSeenAt));
  const canWrite = u.role !== "viewer";
  const st = memberStatus(m, today);
  const op = (name: string, label: string, cls = "btn btn-sm") => (
    <ActionForm action={adminMemberOpAction}>
      <input type="hidden" name="memberId" value={m.id} />
      <input type="hidden" name="op" value={name} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ActionForm>
  );

  return (
    <StaffShell user={u} title={m.name} crumbs={[{ href: `/admin/members?company=${m.companyId}`, label: "会員" }]}>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">企業</div>
          <div style={{ fontWeight: 700 }}>
            <Link href={`/admin/companies/${m.companyId}`}>{row.companyName}</Link>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">状態</div>
          <div style={{ fontWeight: 700 }}>{MEMBER_STATUS_LABEL[st]}</div>
        </div>
        <div className="stat">
          <div className="stat-label">残高</div>
          <div className="stat-value">
            {num(balance)}
            <small>pt</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">ログイン中の端末</div>
          <div className="stat-value">
            {sessions.length}
            <small>台</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">会員ID（代理登録用）</div>
          <code className="small" style={{ wordBreak: "break-all" }}>
            {m.id}
          </code>
        </div>
      </div>
      {m.lockedUntil && m.lockedUntil > new Date() && <p className="notice notice-error">ログインに続けて失敗したため、{fmtDateTime(m.lockedUntil)} までロック中です。</p>}

      {canWrite && (
        <div className="row-actions" style={{ marginBottom: 16 }}>
          {!m.passwordHash && st !== "stopped" && op("invite", "ご案内メールを送る", "btn btn-sm btn-primary")}
          {m.lockedUntil && op("unlock", "ロックを解除")}
          {sessions.length > 0 && op("logout", "すべての端末からログアウト", "btn btn-sm btn-danger")}
        </div>
      )}

      <div className="grid-2">
        <section className="panel panel-tight">
          <h2>ポイント台帳（直近100件）</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>日時</th>
                <th>種別</th>
                <th>内容</th>
                <th className="r">増減</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id}>
                  <td className="small">{fmtDateTime(e.createdAt)}</td>
                  <td className="small">{KIND[e.kind]}</td>
                  <td className="small">
                    {e.note}
                    {e.kind === "adjust" && <span className="mute">（{e.createdBy}）</span>}
                  </td>
                  <td className="r" style={{ color: e.amount > 0 ? "var(--wakatake)" : undefined }}>
                    {e.amount > 0 ? "+" : ""}
                    {num(e.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite && (
            <div style={{ padding: "12px 18px" }}>
              <ActionForm action={adminMemberOpAction} resetOnOk>
                <input type="hidden" name="memberId" value={m.id} />
                <input type="hidden" name="op" value="adjust" />
                <div className="filters">
                  <label className="field">
                    <span>手動調整（pt、減算はマイナス）</span>
                    <input name="amount" inputMode="numeric" required style={{ width: 140 }} />
                  </label>
                  <label className="field">
                    <span>理由</span>
                    <input name="note" required placeholder="例：施設の設備故障のお詫び" style={{ minWidth: 240 }} />
                  </label>
                  <SubmitButton className="btn btn-sm">調整する</SubmitButton>
                </div>
              </ActionForm>
            </div>
          )}
        </section>
        <section className="panel panel-tight">
          <h2>入館（直近30件）</h2>
          <table className="daicho">
            <tbody>
              {visits.length === 0 && (
                <tr>
                  <td className="empty">入館はありません</td>
                </tr>
              )}
              {visits.map(({ c, facilityName }) => (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td className="small">
                    <Link href={`/admin/checkins/${c.id}`}>{fmtDateTime(c.checkedInAt)}</Link>
                  </td>
                  <td className="small">{facilityName}</td>
                  <td className="small">{c.courseName}</td>
                  <td className="r">{num(c.pointsUsed)}pt</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="panel">
        <h2>登録内容</h2>
        <ActionForm action={adminUpdateMemberAction}>
          <input type="hidden" name="memberId" value={m.id} />
          <MemberFields m={m} today={today} />
          {canWrite && <SubmitButton>保存する</SubmitButton>}
        </ActionForm>
      </section>

      <section className="panel panel-tight">
        <h2>ログイン中の端末</h2>
        <table className="daicho">
          <tbody>
            {sessions.length === 0 && (
              <tr>
                <td className="empty">ありません</td>
              </tr>
            )}
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="small">最終 {fmtDateTime(s.lastSeenAt)}</td>
                <td className="small">開始 {fmtDateTime(s.createdAt)}</td>
                <td className="small" style={{ wordBreak: "break-all" }}>
                  {s.userAgent}
                </td>
                <td className="small">
                  <Link href={`/admin/checkins?from=2000-01-01&device=${s.deviceId}`}>端末の入館</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
