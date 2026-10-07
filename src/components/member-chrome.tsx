import Link from "next/link";
import { todayMark } from "@/lib/daily";
import { MemberTabs } from "./member-tabs";

/** 会員画面の枠。上部の細い線と印の色は日替わり。 */
export function MemberChrome({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const mark = todayMark();
  const style = { "--daily": mark.color.hex, "--daily-ink": mark.color.ink } as React.CSSProperties;
  return (
    <div className="m-shell" style={style}>
      <header className="noren">
        <Link href="/m" className="noren-title">
          湯札
          <span className="en">Yufuda</span>
        </Link>
        <div className="noren-right">
          {right ?? (
            <span className="noren-seal" aria-label={`本日の印 ${mark.seal}`} title={`本日の印 ${mark.seal}`}>
              {mark.seal}
            </span>
          )}
        </div>
      </header>
      <main className="m-main">{children}</main>
      <MemberTabs />
    </div>
  );
}
