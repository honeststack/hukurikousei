import type { ImportPlan } from "@/lib/members";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";

const ACTION_LABEL = {
  create: ["新規", "hanko-take"],
  update: ["変更", "hanko-ai"],
  stop: ["停止日の設定", "hanko-shu"],
  unchanged: ["変更なし", "hanko-mute"],
  error: ["エラー", "hanko-shu"],
} as const;

/** CSV一括登録のプレビュー（新規・変更・停止・エラーを分けて表示） */
export function ImportPreview({
  plan,
  importId,
  fileName,
  applyAction,
  discardAction,
}: {
  plan: ImportPlan;
  importId: string;
  fileName: string;
  applyAction: FormAction;
  discardAction: FormAction;
}) {
  const c = plan.counts;
  const changes = c.create + c.update + c.stop + c.missingStop;
  const shown = plan.rows.filter((r) => r.action !== "unchanged");
  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">新規</div>
          <div className="stat-value">{c.create}</div>
        </div>
        <div className="stat">
          <div className="stat-label">変更</div>
          <div className="stat-value">{c.update}</div>
        </div>
        <div className="stat">
          <div className="stat-label">停止日の設定</div>
          <div className="stat-value">{c.stop + c.missingStop}</div>
        </div>
        <div className="stat">
          <div className="stat-label">変更なし</div>
          <div className="stat-value">{c.unchanged}</div>
        </div>
        <div className="stat">
          <div className="stat-label">エラー（反映しません）</div>
          <div className="stat-value" style={{ color: c.error ? "var(--shu)" : undefined }}>
            {c.error}
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>
          「{fileName}」の内容
          <span className="small mute">エラー行は反映されません。直して再度アップロードしてください。</span>
        </h2>
        <div className="table-wrap">
          <table className="daicho">
            <thead>
              <tr>
                <th>行</th>
                <th>区分</th>
                <th>社員番号</th>
                <th>氏名</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && plan.missing.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty">
                    反映する変更はありません
                  </td>
                </tr>
              )}
              {shown.map((r) => (
                <tr key={r.line}>
                  <td className="num">{r.line}</td>
                  <td>
                    <span className={`hanko ${ACTION_LABEL[r.action][1]}`}>{ACTION_LABEL[r.action][0]}</span>
                  </td>
                  <td>{r.employeeNo}</td>
                  <td>{r.name}</td>
                  <td className="small">
                    {r.errors.map((e) => (
                      <div key={e} style={{ color: "var(--shu)" }}>
                        {e}
                      </div>
                    ))}
                    {r.changes.map((x) => (
                      <div key={x}>{x}</div>
                    ))}
                    {r.action === "create" && r.data && (
                      <div>
                        {r.data.email}・{r.data.startsOn}から
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {plan.missingAction === "stop" &&
                plan.missing.map((m) => (
                  <tr key={m.memberId}>
                    <td>—</td>
                    <td>
                      <span className="hanko hanko-shu">停止</span>
                    </td>
                    <td>{m.employeeNo}</td>
                    <td>{m.name}</td>
                    <td className="small">CSVにないため、本日（{plan.stopDateForMissing}）で利用停止</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {plan.missingAction === "keep" && plan.missing.length > 0 && (
          <p className="small mute" style={{ marginTop: 8 }}>
            CSVに含まれない利用中の会員が {plan.missing.length} 名います（今回は変更しません）。
          </p>
        )}
      </section>

      <div className="row-actions">
        <ActionForm action={applyAction} confirm={`${changes}件を反映します。よろしいですか？`}>
          <input type="hidden" name="importId" value={importId} />
          {c.create > 0 && (
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" name="sendInvites" defaultChecked />
              新規の {c.create} 名に会員証のご案内メールを送る
            </label>
          )}
          <SubmitButton className="btn btn-primary" pendingText="反映しています…">
            {changes}件を反映する
          </SubmitButton>
        </ActionForm>
        <ActionForm action={discardAction}>
          <input type="hidden" name="importId" value={importId} />
          <SubmitButton className="btn">やめる</SubmitButton>
        </ActionForm>
      </div>
    </>
  );
}
