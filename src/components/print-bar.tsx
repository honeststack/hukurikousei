"use client";

export function PrintBar({ note }: { note?: string }) {
  return (
    <div className="print-bar no-print">
      <button type="button" className="btn btn-sm" onClick={() => window.print()}>
        印刷する
      </button>
      <button type="button" className="btn btn-sm" onClick={() => window.close()}>
        閉じる
      </button>
      {note && <span style={{ color: "#fff", alignSelf: "center", fontSize: "0.85rem" }}>{note}</span>}
    </div>
  );
}
