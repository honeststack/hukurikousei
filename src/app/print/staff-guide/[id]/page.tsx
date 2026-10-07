import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilityIdsFor } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { PrintBar } from "@/components/print-bar";

export const metadata = { title: "スタッフ向け確認ガイド" };

const box: React.CSSProperties = { border: "1px solid #bbb", borderRadius: 4, padding: "5mm 6mm", marginBottom: "6mm" };
const h: React.CSSProperties = { fontSize: 17, margin: "0 0 3mm", borderBottom: "2px solid #1f1e1c", paddingBottom: 2 };

export default async function StaffGuidePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["admin", "operator", "viewer", "facility"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id) || !(await facilityIdsFor(u)).includes(id)) notFound();
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, id));
  if (!f) notFound();
  const s = await getSettings(db);
  return (
    <>
      <PrintBar note="受付の内側に貼ってご利用ください" />
      <div className="sheet-a4" style={{ fontSize: 14, lineHeight: 1.7 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", borderBottom: "4px double #111", paddingBottom: 4, marginBottom: "7mm" }}>
          <div style={{ fontFamily: "var(--font-mincho)", fontWeight: 700, fontSize: 28, letterSpacing: "0.08em" }}>湯札 受付の確認ガイド</div>
          <div>{f.name}</div>
        </div>

        <div style={box}>
          <h2 style={h}>確認するのは4つだけ（目安3秒）</h2>
          <ol style={{ margin: 0, paddingLeft: "1.3em", fontSize: 16 }}>
            <li>
              <b>施設名</b>が「{f.name}」になっている
            </li>
            <li>
              <b>時計が秒まで動いている</b>（止まっていたらスクリーンショットです）
            </li>
            <li>
              <b>色と印</b>が本日のものと同じ（管理画面「本日の入館」の右上に表示されます。同じ日はどの会員も同じ色です）
            </li>
            <li>
              <b>「受付でお支払い」の金額</b>をいただく（0円なら会計なし）
            </li>
          </ol>
        </div>

        <div style={box}>
          <h2 style={h}>お会計</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
            <li>入館証の「受付でお支払い」が、ポイント不足分と追加料金（土日祝・深夜など）の合計です。</li>
            <li>ポイントで支払われた分は、毎月の精算で運営からお支払いします。</li>
            <li>深夜料金など、滞在時間で決まる料金は通常どおり退館時に精算してください（入館証に「ご注意」として表示されます）。</li>
          </ul>
        </div>

        <div style={box}>
          <h2 style={h}>こんなときは</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {[
                ["入館証の時計が止まっている・色が違う", "受け付けずに、その場でQRを読み取り直してもらってください。"],
                ["お客様がコースを選び間違えた", "入館から3分以内ならお客様の画面で取消できます。過ぎていたら管理画面「本日の入館」から取り消してください。"],
                ["「本日はすでに入館済み」と出る", "入館は1日1回までです。同日の再入館はポイントでは受けられません。"],
                ["お客様のスマートフォンの電池切れ・故障", "通常料金でのご案内をお願いします。"],
                ["システムが使えない", `紙に「会社名・氏名・時刻・コース」を控え、${s.supportName}（${s.supportPhone}）へご連絡ください。運営が後で登録します。`],
              ].map(([q, a]) => (
                <tr key={q}>
                  <th style={{ textAlign: "left", verticalAlign: "top", padding: "2mm 4mm 2mm 0", width: "38%", borderBottom: "1px solid #ddd" }}>{q}</th>
                  <td style={{ padding: "2mm 0", borderBottom: "1px solid #ddd" }}>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ ...box, background: "#f6f3ee", border: 0 }}>
          運営への連絡先：<b>{s.supportName}</b>　電話 {s.supportPhone}（{s.supportHours}）　メール {s.supportEmail}
        </div>
      </div>
    </>
  );
}
