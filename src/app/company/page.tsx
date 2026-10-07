import Link from "next/link";
import { and, count, eq, gt, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { contractOn } from "@/lib/ledger";
import { companyReport } from "@/lib/reports";
import { addMonths, currentPeriod, fmtPeriod, jstDate, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { inviteAllPendingAction } from "./actions";

export const metadata = { title: "導入企業トップ" };

export default async function CompanyHome() {
  const u = await requireStaff(["company"]);
  const companyId = u.companyId!;
  const db = await getDb();
  const today = jstDate(new Date());
  const period = currentPeriod();
  const [cur] = await companyReport(db, period, companyId);
  const [prev] = await companyReport(db, addMonths(period, -1), companyId);
  const contract = await contractOn(db, companyId, today);
  const [pending] = await db
    .select({ n: count() })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.companyId, companyId),
        isNull(schema.members.passwordHash),
        or(isNull(schema.members.stopsOn), gt(schema.members.stopsOn, today)),
      ),
    );
  const pendingN = Number(pending?.n ?? 0);

  return (
    <StaffShell user={u} title="トップ">
      <div className="stats">
        <div className="stat">
          <div className="stat-label">会員（{fmtPeriod(period)}）</div>
          <div className="stat-value">
            {num(cur?.members ?? 0)}
            <small>名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">今月の利用人数</div>
          <div className="stat-value">
            {num(cur?.users ?? 0)}
            <small>名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">今月の利用率</div>
          <div className="stat-value">
            {Math.round((cur?.usageRate ?? 0) * 100)}
            <small>%</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">前月の利用（{fmtPeriod(addMonths(period, -1))}）</div>
          <div className="stat-value">
            {num(prev?.users ?? 0)}
            <small>名・{num(prev?.visits ?? 0)}回</small>
          </div>
        </div>
      </div>

      {pendingN > 0 && (
        <section className="panel">
          <h2>会員証の初回設定がまだの方：{pendingN}名</h2>
          <p className="small">ご案内メールが届いていない、または期限（14日）が切れている可能性があります。まとめて再送できます。</p>
          <div className="row-actions">
            <ActionForm action={inviteAllPendingAction} confirm={`${pendingN}名にご案内メールを再送します。よろしいですか？`}>
              <SubmitButton>まとめて再送する</SubmitButton>
            </ActionForm>
            <Link href="/company/members?status=invited" className="btn">
              一覧を見る
            </Link>
          </div>
        </section>
      )}

      <div className="grid-2">
        <section className="panel">
          <h2>ご契約</h2>
          {contract ? (
            <dl className="kv">
              <dt>毎月の付与</dt>
              <dd>{num(contract.monthlyPoints)}pt（毎月1日）</dd>
              <dt>繰越</dt>
              <dd>{contract.carryover === "cap" ? `翌月へ ${num(contract.carryoverCap)}pt まで` : "なし（月末で失効）"}</dd>
              <dt>ご請求</dt>
              <dd>{contract.billingBasis === "per_member" ? `会員1名あたり月 ${yen(contract.feePerMember)}` : "ご利用分（利用ポイント×換算率）"}</dd>
              <dt>契約期間</dt>
              <dd>
                {contract.startsOn.replace(/-/g, "/")} 〜 {contract.endsOn?.replace(/-/g, "/") ?? ""}
              </dd>
            </dl>
          ) : (
            <p className="notice notice-error">有効な契約がありません。運営にお問い合わせください。</p>
          )}
        </section>
        <section className="panel">
          <h2>よく使う操作</h2>
          <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
            <li>
              <Link href="/company/members">会員を1名ずつ登録・退職者の停止日を設定</Link>
            </li>
            <li>
              <Link href="/company/import">人事データのCSVで一括登録・更新</Link>
            </li>
            <li>
              <Link href="/company/usage">月別の利用状況を見る</Link>
            </li>
            <li>
              <Link href="/company/kit">従業員への案内文・ポスターを出力</Link>
            </li>
          </ul>
        </section>
      </div>
    </StaffShell>
  );
}
