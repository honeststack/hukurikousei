import Papa from "papaparse";

/** Excelで開いて文字化けしないCSV（UTF-8 BOM付き・CRLF） */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // 先頭が = + - @ の値は数式として解釈されないようにする（CSVインジェクション対策）
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export function csvResponse(fileName: string, body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="export.csv"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** UTF-8（BOM有無）と Shift_JIS（Excel既定）の両方を受け付ける */
export function decodeCsvBytes(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("shift_jis").decode(bytes);
  }
}

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const res = Papa.parse<string[]>(text.trim(), { skipEmptyLines: "greedy" });
  const all = res.data.map((r) => r.map((c) => (c ?? "").trim()));
  return { header: all[0] ?? [], rows: all.slice(1) };
}

/** 2026/4/1・2026-04-01・2026年4月1日 → 2026-04-01 */
export function normalizeDate(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?$/.exec(t);
  if (!m) return "invalid";
  const out = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(`${out}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== out) return "invalid";
  return out;
}
