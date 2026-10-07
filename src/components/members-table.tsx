import Link from "next/link";
import { MEMBER_STATUS_LABEL, memberStatus } from "@/lib/members";
import { fmtDateTime } from "@/lib/time";

type Row = {
  m: {
    id: string;
    employeeNo: string;
    name: string;
    nameKana: string;
    email: string;
    department: string;
    startsOn: string;
    stopsOn: string | null;
    passwordHash: string | null;
    lastLoginAt: Date | null;
  };
  companyName: string;
};

const HANKO: Record<string, string> = {
  invited: "hanko-shu",
  active: "hanko-take",
  scheduled: "hanko-ai",
  stopped: "hanko-mute",
  not_started: "hanko-ai",
};

export function MembersTable({ rows, today, hrefBase, showCompany }: { rows: Row[]; today: string; hrefBase: string; showCompany?: boolean }) {
  return (
    <div className="panel panel-tight table-wrap">
      <table className="daicho">
        <thead>
          <tr>
            {showCompany && <th>会社</th>}
            <th>社員番号</th>
            <th>氏名</th>
            <th>部署</th>
            <th>メール</th>
            <th>利用期間</th>
            <th>状態</th>
            <th>最終ログイン</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showCompany ? 8 : 7} className="empty">
                該当する会員はいません
              </td>
            </tr>
          )}
          {rows.map(({ m, companyName }) => {
            const st = memberStatus(m, today);
            return (
              <tr key={m.id} className={st === "stopped" ? "is-off" : undefined}>
                {showCompany && <td className="small">{companyName}</td>}
                <td className="num">{m.employeeNo}</td>
                <td>
                  <Link href={`${hrefBase}/${m.id}`}>{m.name}</Link>
                  {m.nameKana && <div className="small mute">{m.nameKana}</div>}
                </td>
                <td>{m.department}</td>
                <td className="small">{m.email}</td>
                <td className="small num">
                  {m.startsOn.replace(/-/g, "/")}〜{m.stopsOn ? m.stopsOn.replace(/-/g, "/") : ""}
                </td>
                <td>
                  <span className={`hanko ${HANKO[st]}`}>{MEMBER_STATUS_LABEL[st]}</span>
                </td>
                <td className="small">{fmtDateTime(m.lastLoginAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MemberFilterForm({ q, status, action, extra }: { q?: string; status?: string; action: string; extra?: React.ReactNode }) {
  return (
    <form className="filters" method="get" action={action}>
      {extra}
      <label className="field">
        <span>検索</span>
        <input name="q" defaultValue={q} placeholder="氏名・社員番号・メール・部署" style={{ minWidth: 240 }} />
      </label>
      <label className="field">
        <span>状態</span>
        <select name="status" defaultValue={status ?? ""}>
          <option value="">すべて</option>
          <option value="active">利用中</option>
          <option value="invited">初回設定まだ</option>
          <option value="scheduled">停止予定</option>
          <option value="stopped">停止</option>
          <option value="not_started">開始前</option>
        </select>
      </label>
      <button className="btn btn-sm" type="submit">
        絞り込む
      </button>
    </form>
  );
}
