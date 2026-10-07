import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { appUrl } from "@/lib/mail";
import { facilityIdsFor } from "@/lib/scope";
import { PrintBar } from "@/components/print-bar";

export const metadata = { title: "QRポスター" };

function Steps({ compact }: { compact?: boolean }) {
  const items = [
    ["読み取る", "スマートフォンのカメラで、このQRコードを読み取ります"],
    ["選ぶ", "コースを選び、本日の追加料金を確かめて「スライドして入館」"],
    ["見せる", "表示された入館証を、受付のスタッフにお見せください"],
  ];
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: compact ? 6 : 14 }}>
      {items.map(([h, t], i) => (
        <li key={h} style={{ display: "grid", gridTemplateColumns: compact ? "34px 1fr" : "54px 1fr", gap: 12, alignItems: "center" }}>
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: compact ? 30 : 48,
              height: compact ? 30 : 48,
              borderRadius: "50%",
              background: "#1f1e1c",
              color: "#fff",
              fontFamily: "var(--font-mincho)",
              fontWeight: 700,
              fontSize: compact ? 16 : 24,
            }}
          >
            {["一", "二", "三"][i]}
          </span>
          <span style={{ fontSize: compact ? 13 : 20, lineHeight: 1.5 }}>
            <b style={{ fontSize: compact ? 15 : 24, marginRight: 8 }}>{h}</b>
            {t}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function QrPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ size?: string }> }) {
  const u = await requireStaff(["admin", "operator", "viewer", "facility"]);
  const { id } = await params;
  const { size } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ q: schema.facilityQrs, f: schema.facilities })
    .from(schema.facilityQrs)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.facilityQrs.facilityId))
    .where(eq(schema.facilityQrs.id, id));
  if (!row || !(await facilityIdsFor(u)).includes(row.f.id)) notFound();
  const url = appUrl(`/q/${row.q.token}`);
  const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } });
  const qr = <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />;

  if (size === "pop") {
    // A4を横半分に折って立てる卓上POP（上半分は逆さに印刷）
    const half = (flip: boolean) => (
      <div
        style={{
          height: "50%",
          padding: "12mm 14mm",
          display: "grid",
          gridTemplateColumns: "62mm 1fr",
          gap: "10mm",
          alignItems: "center",
          transform: flip ? "rotate(180deg)" : undefined,
        }}
      >
        <div style={{ width: "62mm", height: "62mm", padding: "3mm", border: "1.5mm solid #1f1e1c", borderRadius: "3mm" }}>{qr}</div>
        <div>
          <div style={{ fontFamily: "var(--font-mincho)", fontWeight: 700, fontSize: 30, letterSpacing: "0.1em", color: "#1f1e1c" }}>湯札の会員の方へ</div>
          <div style={{ fontSize: 15, margin: "4px 0 10px" }}>{row.f.name}</div>
          <Steps compact />
        </div>
      </div>
    );
    return (
      <>
        <PrintBar note="A4用紙に印刷し、中央の点線で山折りにして立ててください" />
        <div className="sheet-a4" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
          {half(true)}
          <div style={{ borderTop: "1px dashed #999", position: "relative" }}>
            <span className="no-print" style={{ position: "absolute", right: 8, top: -18, fontSize: 11, color: "#999" }}>
              山折り
            </span>
          </div>
          {half(false)}
        </div>
      </>
    );
  }

  return (
    <>
      <PrintBar note="A4用紙に印刷し、受付の見やすい場所に掲示してください" />
      <div className="sheet-a4" style={{ padding: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ background: "#1f1e1c", color: "#fff", padding: "14mm 16mm 10mm", position: "relative" }}>
          <div style={{ fontSize: 18, letterSpacing: "0.2em" }}>福利厚生でご利用の方へ</div>
          <div style={{ fontFamily: "var(--font-mincho)", fontWeight: 700, fontSize: 54, letterSpacing: "0.15em", lineHeight: 1.2 }}>湯札 受付</div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: "-8mm",
              height: "8mm",
              background:
                "linear-gradient(90deg,#1f1e1c 0 24.5%,transparent 24.5% 25.5%,#1f1e1c 25.5% 49.5%,transparent 49.5% 50.5%,#1f1e1c 50.5% 74.5%,transparent 74.5% 75.5%,#1f1e1c 75.5%)",
            }}
          />
        </div>
        <div style={{ padding: "18mm 16mm 0", display: "grid", justifyItems: "center", gap: "8mm", flex: 1 }}>
          <div style={{ width: "105mm", height: "105mm", padding: "5mm", border: "2mm solid #1f1e1c", borderRadius: "4mm", background: "#fff" }}>{qr}</div>
          <div style={{ width: "100%" }}>
            <Steps />
          </div>
        </div>
        <div style={{ padding: "0 16mm 12mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 12, color: "#555" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mincho)", fontWeight: 700, fontSize: 20, color: "#111" }}>{row.f.name}</div>
            設置場所：{row.q.label || "受付"}
          </div>
          <div style={{ textAlign: "right" }}>
            入館は1日1回まで。追加料金・ポイント不足分は受付でお支払いください。
            <br />
            受付で入館証（時計が秒まで動く画面）をお見せいただいた方のみご入館いただけます。
          </div>
        </div>
      </div>
    </>
  );
}
