import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilitiesFor } from "@/lib/scope";
import { statementLines } from "@/lib/statements";
import { fmtPeriod } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { StatementView } from "@/components/statement-view";
import { confirmStatementAction, disputeStatementAction } from "../../actions";

export const metadata = { title: "精算明細" };

export default async function FacilityStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["facility"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const facilities = await facilitiesFor(u);
  const db = await getDb();
  const [st] = await db.select().from(schema.statements).where(eq(schema.statements.id, id));
  const facility = facilities.find((f) => f.id === st?.facilityId);
  if (!st || !facility) notFound();
  const lines = await statementLines(db, st.facilityId, st.period, st);

  return (
    <StaffShell
      user={u}
      title={`${fmtPeriod(st.period)}の精算`}
      crumbs={[{ href: "/facility/settlements", label: "月次精算" }]}
      actions={
        <>
          <a className="btn btn-sm" href={`/api/csv/statement/${st.id}`}>
            明細CSV
          </a>
          {st.status === "closed" && (
            <a className="btn btn-sm btn-primary" href={`/print/statement/${st.id}`} target="_blank" rel="noopener">
              支払通知書を印刷
            </a>
          )}
        </>
      }
    >
      {st.status === "review" && !st.facilityConfirmedAt && (
        <section className="panel">
          <h2>内容のご確認をお願いします</h2>
          <div className="grid-2">
            <ActionForm action={confirmStatementAction}>
              <input type="hidden" name="statementId" value={st.id} />
              <p className="small">レジ締めの記録と照らし合わせ、相違がなければ「確認済みにする」を押してください。</p>
              <SubmitButton className="btn btn-go">確認済みにする</SubmitButton>
            </ActionForm>
            <ActionForm action={disputeStatementAction}>
              <input type="hidden" name="statementId" value={st.id} />
              <label className="field">
                <span>相違がある場合は内容を運営へ</span>
                <textarea name="note" required placeholder="例：10/14 の入館は、お客様がご入館前にお帰りになりました" />
              </label>
              <SubmitButton className="btn btn-danger btn-sm">運営に問い合わせる</SubmitButton>
            </ActionForm>
          </div>
        </section>
      )}
      {st.status === "draft" && <p className="notice">月の途中の仮集計です。月が終わると、運営が確認を依頼します。</p>}
      <StatementView st={st} facilityName={facility.name} lines={lines} showMembers="family" />
    </StaffShell>
  );
}
