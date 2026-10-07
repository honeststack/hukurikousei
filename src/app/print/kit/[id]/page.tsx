import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { contractOn } from "@/lib/ledger";
import { getSettings } from "@/lib/settings";
import { jstDate, num } from "@/lib/time";
import { PrintBar } from "@/components/print-bar";

export const metadata = { title: "社内周知用のご案内" };

export default async function KitPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["admin", "operator", "viewer", "company"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || (u.role === "company" && u.companyId !== id)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, id));
  if (!c) notFound();
  const contract = await contractOn(db, c.id, jstDate(new Date()));
  const facilities = await db.select().from(schema.facilities).where(eq(schema.facilities.status, "active")).orderBy(schema.facilities.area);
  const s = await getSettings(db);
  return (
    <>
      <PrintBar note="社内掲示・回覧用です。PDFに保存してメールに添付することもできます" />
      <div className="sheet-a4" style={{ fontSize: 14, lineHeight: 1.8, padding: 0 }}>
        <div style={{ background: "#1f1e1c", color: "#fff", padding: "12mm 16mm 10mm" }}>
          <div style={{ fontSize: 15 }}>{c.name} 従業員の皆さまへ</div>
          <div style={{ fontFamily: "var(--font-mincho)", fontWeight: 700, fontSize: 34, letterSpacing: "0.08em", lineHeight: 1.35 }}>
            提携のスーパー銭湯・サウナが
            <br />
            毎月のポイントで使えます
          </div>
        </div>
        <div style={{ padding: "10mm 16mm" }}>
          <p>
            福利厚生として「湯札」を導入しました。スマートフォンの会員証で、提携の温浴施設をご利用いただけます。
            {contract && (
              <>
                毎月1日に <b>{num(contract.monthlyPoints)}ポイント</b> が付与されます。
              </>
            )}
          </p>
          <h2 style={{ fontSize: 18, borderBottom: "2px solid #1f1e1c", margin: "6mm 0 3mm" }}>はじめに（1分）</h2>
          <ol style={{ paddingLeft: "1.3em", margin: 0 }}>
            <li>
              会社から届く「<b>【湯札】会員証のご案内</b>」メールを開きます
            </li>
            <li>リンクからパスワードを決めると、会員証が表示されます（アプリのインストールは不要です）</li>
            <li>スマートフォンのホーム画面に追加しておくと、すぐに開けます</li>
          </ol>
          <h2 style={{ fontSize: 18, borderBottom: "2px solid #1f1e1c", margin: "6mm 0 3mm" }}>施設での使い方</h2>
          <ol style={{ paddingLeft: "1.3em", margin: 0 }}>
            <li>受付にある「湯札」のQRコードをスマートフォンで読み取る</li>
            <li>コースを選び、その日の追加料金（土日祝・深夜など）を確かめて「スライドして入館」</li>
            <li>表示された入館証を受付に見せる。追加料金やポイント不足分は受付で支払う</li>
          </ol>
          <h2 style={{ fontSize: 18, borderBottom: "2px solid #1f1e1c", margin: "6mm 0 3mm" }}>ご利用いただける施設（{facilities.length}施設）</h2>
          <p style={{ margin: 0 }}>{facilities.map((f) => `${f.name}（${f.area}）`).join("、")}</p>
          <h2 style={{ fontSize: 18, borderBottom: "2px solid #1f1e1c", margin: "6mm 0 3mm" }}>ご注意</h2>
          <ul style={{ paddingLeft: "1.2em", margin: 0 }}>
            <li>入館は1日1回までです。ポイントは月末に失効します（繰越の有無はご契約によります）。</li>
            <li>会員証を他の人に使わせることはできません。</li>
            <li>会社には、利用人数などの集計のみが報告されます。</li>
          </ul>
          <div style={{ marginTop: "8mm", padding: "4mm 6mm", background: "#f6f3ee" }}>
            お問い合わせ：社内のご担当（{c.contactName || "人事・総務"}）または {s.supportName}（{s.supportPhone}・{s.supportHours}）
          </div>
        </div>
      </div>
    </>
  );
}
