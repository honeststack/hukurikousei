import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { refreshStatement, statementLines } from "@/lib/statements";
import { fmtPeriod } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { StatementView } from "@/components/statement-view";
import { READ } from "../../_ctx";
import { statementOpAction } from "../../actions-ops";

export const metadata = { title: "精算明細" };

export default async function AdminStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(READ);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ st: schema.statements, f: schema.facilities })
    .from(schema.statements)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.statements.facilityId))
    .where(eq(schema.statements.id, id));
  if (!row) notFound();
  const st = row.st.status === "closed" ? row.st : await refreshStatement(db, row.st);
  const lines = await statementLines(db, st.facilityId, st.period, st);
  const canWrite = u.role !== "viewer";
  return (
    <StaffShell
      user={u}
      title={`${row.f.name}　${fmtPeriod(st.period)}`}
      crumbs={[{ href: `/admin/settlements?p=${st.period}`, label: "月次精算" }]}
      actions={
        <>
          <a className="btn btn-sm" href={`/api/csv/statement/${st.id}`}>
            明細CSV
          </a>
          {st.status === "closed" && (
            <a className="btn btn-sm btn-primary" href={`/print/statement/${st.id}`} target="_blank" rel="noopener">
              支払通知書
            </a>
          )}
        </>
      }
    >
      {canWrite && st.status !== "closed" && (
        <ActionForm action={statementOpAction} confirm={undefined}>
          <input type="hidden" name="statementId" value={st.id} />
          <div className="row-actions" style={{ marginBottom: 16 }}>
            {st.status === "draft" && (
              <SubmitButton className="btn btn-sm btn-primary" name="op" value="review">
                施設に確認依頼
              </SubmitButton>
            )}
            {st.status === "review" && (
              <>
                <SubmitButton className="btn btn-sm" name="op" value="reopen">
                  締め前に戻す
                </SubmitButton>
                {u.role === "admin" && (
                  <SubmitButton className="btn btn-sm btn-danger" name="op" value="close">
                    確定する
                  </SubmitButton>
                )}
              </>
            )}
          </div>
        </ActionForm>
      )}
      <StatementView st={st} facilityName={row.f.name} lines={lines} showMembers="full" />
    </StaffShell>
  );
}
