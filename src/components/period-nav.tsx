import Link from "next/link";
import { addMonths, currentPeriod, fmtPeriod } from "@/lib/time";

/** 対象月の切り替え */
export function PeriodNav({ period, basePath, extra = "" }: { period: string; basePath: string; extra?: string }) {
  const cur = currentPeriod();
  return (
    <nav className="filters" aria-label="対象月" style={{ alignItems: "center" }}>
      <Link className="btn btn-sm" href={`${basePath}?p=${addMonths(period, -1)}${extra}`}>
        ‹ 前月
      </Link>
      <b className="mincho" style={{ fontSize: "1.2rem", minWidth: 120, textAlign: "center" }}>
        {fmtPeriod(period)}
      </b>
      {period < cur && (
        <Link className="btn btn-sm" href={`${basePath}?p=${addMonths(period, 1)}${extra}`}>
          翌月 ›
        </Link>
      )}
      {period !== cur && (
        <Link className="btn btn-sm btn-link" href={`${basePath}?p=${cur}${extra}`}>
          今月
        </Link>
      )}
    </nav>
  );
}
