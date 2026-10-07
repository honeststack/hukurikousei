import { CSV_TEMPLATE_HEADER } from "@/lib/members";
import { ActionForm, SubmitButton, type FormAction } from "./action-form";

export function ImportUpload({ action, hidden }: { action: FormAction; hidden?: React.ReactNode }) {
  return (
    <div className="grid-2">
      <section className="panel">
        <h2>CSVファイルを選ぶ</h2>
        <ActionForm action={action}>
          {hidden}
          <label className="field">
            <span>CSVファイル</span>
            <input type="file" name="file" accept=".csv,text/csv" required />
            <span className="hint">Excelで「CSV（コンマ区切り）」または「CSV UTF-8」で保存したファイル</span>
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <span>CSVに載っていない会員</span>
            <label className="check">
              <input type="radio" name="missingAction" value="keep" defaultChecked />
              そのままにする（追加・変更だけ反映）
            </label>
            <label className="check">
              <input type="radio" name="missingAction" value="stop" />
              本日で利用停止にする（全従業員のCSVをアップロードする場合）
            </label>
          </fieldset>
          <SubmitButton pendingText="確認しています…">内容を確認する</SubmitButton>
          <p className="small mute" style={{ marginTop: 8 }}>
            次の画面で、新規・変更・停止・エラーを確認してから反映します。この時点ではまだ反映されません。
          </p>
        </ActionForm>
      </section>
      <section className="panel">
        <h2>CSVの形式</h2>
        <p className="small">1行目に見出しを入れてください。列の順番は自由です。「社員番号」「氏名」「メールアドレス」は必須です。</p>
        <table className="daicho">
          <thead>
            <tr>
              <th>見出し</th>
              <th>内容</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["社員番号", "会員を見分けるキー。既存の番号は「変更」になります"],
              ["氏名", "例：山田 花子"],
              ["フリガナ", "任意"],
              ["メールアドレス", "ログインIDとご案内の送り先"],
              ["部署", "任意（利用状況の部署別集計に使います）"],
              ["利用開始日", "例：2026/04/01（空欄なら本日）"],
              ["利用停止日", "退職日の翌日など。空欄なら無期限"],
            ].map(([h, d]) => (
              <tr key={h}>
                <td>
                  <b>{h}</b>
                </td>
                <td className="small">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}>
          <a className="btn btn-sm" href="/api/csv/template">
            ひな形をダウンロード（{CSV_TEMPLATE_HEADER.length}列）
          </a>
        </p>
      </section>
    </div>
  );
}
