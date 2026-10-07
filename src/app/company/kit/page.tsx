import { getDb, schema } from "@/db";
import { eq } from "drizzle-orm";
import { requireStaff } from "@/lib/auth";
import { appUrl } from "@/lib/mail";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "社内周知キット" };

export default async function CompanyKitPage() {
  const u = await requireStaff(["company"]);
  const db = await getDb();
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, u.companyId!));
  const mail = `件名：【福利厚生】提携のスーパー銭湯・サウナが使えるようになりました

従業員各位

福利厚生として「湯札」を導入しました。
提携の温浴施設（スーパー銭湯・サウナ）を、毎月付与されるポイントでご利用いただけます。

■はじめに
・後ほど「【湯札】会員証のご案内」というメールが届きます。
・メールのリンクからパスワードを決めると、スマートフォンに会員証が表示されます。
・アプリのインストールは不要です。

■使い方
1. 施設の受付にあるQRコードを読み取る
2. コースを選んで「スライドして入館」
3. 表示された入館証を受付に見せる

会員証：${appUrl("/login")}

※会社には利用人数などの集計のみが報告されます。
※ご不明な点は ${c?.contactName || "人事・総務"} までお問い合わせください。`;
  return (
    <StaffShell user={u} title="社内周知キット">
      <div className="grid-2">
        <section className="panel">
          <h2>
            掲示・回覧用のご案内（A4）
            <a className="btn btn-sm btn-primary" href={`/print/kit/${u.companyId}`} target="_blank" rel="noopener">
              開いて印刷
            </a>
          </h2>
          <p className="small">社名入りのご案内です。休憩室への掲示、社内ポータルへの掲載（PDFに保存）にお使いください。</p>
        </section>
        <section className="panel">
          <h2>会員登録用のCSVひな形</h2>
          <p className="small">人事システムから出力したデータを貼り付けて、「CSV一括登録」でアップロードしてください。</p>
          <a className="btn btn-sm" href="/api/csv/template">
            ひな形をダウンロード
          </a>
        </section>
      </div>
      <section className="panel">
        <h2>社内メールの文例</h2>
        <textarea readOnly defaultValue={mail} className="input" style={{ width: "100%", minHeight: 420, fontFamily: "inherit", lineHeight: 1.7 }} />
      </section>
    </StaffShell>
  );
}
