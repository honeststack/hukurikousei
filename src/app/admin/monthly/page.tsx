import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime, fmtPeriod, num } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { runDailyAction } from "../actions-ops";

export const metadata = { title: "定期処理" };

export default async function MonthlyPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const runs = await db.select().from(schema.monthlyRuns).orderBy(desc(schema.monthlyRuns.period)).limit(24);
  return (
    <StaffShell user={u} title="定期処理">
      <div className="grid-2">
        <section className="panel">
          <h2>処理の内容</h2>
          <ol className="small" style={{ margin: 0, paddingLeft: "1.3em" }}>
            <li>前月のポイントを失効（契約に繰越があれば上限まで残す）</li>
            <li>当月のポイントを付与（毎月1日。月途中の利用開始者は契約の設定に従う）</li>
            <li>利用停止日を過ぎた会員の残りポイントを無効化</li>
            <li>前月・当月の精算明細を集計</li>
          </ol>
          <p className="small" style={{ marginTop: 10 }}>
            毎日1回、サーバーのスケジューラから自動で実行します（<code>POST /api/cron/monthly</code> または <code>npm run job:monthly</code>）。
            何度実行しても二重に付与されることはありません。万一止まっていても、会員が会員証を開いた時点でその会員の分が処理されます。
          </p>
        </section>
        <section className="panel">
          <h2>手動で実行</h2>
          <p className="small">スケジューラの停止などで当月の処理が終わっていない場合に実行してください。</p>
          {u.role !== "viewer" && (
            <ActionForm action={runDailyAction} confirm="定期処理を実行します。よろしいですか？">
              <SubmitButton pendingText="実行しています…">今すぐ実行する</SubmitButton>
            </ActionForm>
          )}
        </section>
      </div>
      <section className="panel panel-tight">
        <h2>実行の記録</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>対象月</th>
              <th>状態</th>
              <th>最終実行</th>
              <th className="r">付与（累計）</th>
              <th className="r">失効（累計）</th>
              <th>エラー</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  まだ実行されていません
                </td>
              </tr>
            )}
            {runs.map((r) => (
              <tr key={r.period}>
                <td>{fmtPeriod(r.period)}</td>
                <td>
                  {r.status === "done" ? <span className="hanko hanko-take">完了</span> : r.status === "failed" ? <span className="hanko hanko-shu">失敗</span> : <span className="hanko hanko-ai">実行中</span>}
                </td>
                <td className="small">{fmtDateTime(r.finishedAt ?? r.startedAt)}</td>
                <td className="r">{num(r.grantedCount)}名</td>
                <td className="r">{num(r.expiredCount)}名</td>
                <td className="small" style={{ color: "var(--shu)" }}>
                  {r.error}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
