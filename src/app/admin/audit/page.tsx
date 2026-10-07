import { and, desc, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { addDays, fmtDateTime, isValidYmd, jstDate, jstToDate } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";

export const metadata = { title: "操作ログ" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const u = await requireStaff(READ);
  const sp = await searchParams;
  const today = jstDate(new Date());
  const to = sp.to && isValidYmd(sp.to) ? sp.to : today;
  const from = sp.from && isValidYmd(sp.from) ? sp.from : addDays(to, -7);
  const conds: SQL[] = [gte(schema.auditLogs.createdAt, jstToDate(from, 0)), lte(schema.auditLogs.createdAt, jstToDate(addDays(to, 1), 0))];
  if (sp.q) {
    const like = `%${sp.q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(schema.auditLogs.actorName, like), ilike(schema.auditLogs.action, like), ilike(schema.auditLogs.targetId, like))!);
  }
  const db = await getDb();
  const logs = await db.select().from(schema.auditLogs).where(and(...conds)).orderBy(desc(schema.auditLogs.id)).limit(500);
  return (
    <StaffShell user={u} title="操作ログ">
      <p className="small">登録・変更・取消・精算などの操作をすべて記録しています。この記録は管理者でも変更・削除できません。</p>
      <form className="filters" method="get">
        <label className="field">
          <span>から</span>
          <input type="date" name="from" defaultValue={from} />
        </label>
        <label className="field">
          <span>まで</span>
          <input type="date" name="to" defaultValue={to} />
        </label>
        <label className="field">
          <span>操作者・操作・対象ID</span>
          <input name="q" defaultValue={sp.q} />
        </label>
        <button className="btn btn-sm" type="submit">
          絞り込む
        </button>
      </form>
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>日時</th>
              <th>操作者</th>
              <th>操作</th>
              <th>対象</th>
              <th>内容</th>
              <th>通信元</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  記録はありません
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="small num">{fmtDateTime(l.createdAt)}</td>
                <td className="small">
                  {l.actorName}
                  <div className="mute">{l.actorKind}</div>
                </td>
                <td className="small">{l.action}</td>
                <td className="small" style={{ wordBreak: "break-all" }}>
                  {l.targetType}
                  <div className="mute">{l.targetId}</div>
                </td>
                <td className="small" style={{ wordBreak: "break-all", maxWidth: 420 }}>
                  {l.detail ? JSON.stringify(l.detail) : ""}
                </td>
                <td className="small">{l.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
