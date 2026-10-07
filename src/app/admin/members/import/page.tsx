import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import type { ImportPlan } from "@/lib/members";
import { ImportPreview } from "@/components/import-preview";
import { ImportUpload } from "@/components/import-upload";
import { StaffShell } from "@/components/staff-shell";
import { WRITE } from "../../_ctx";
import { adminApplyImportAction, adminDiscardImportAction, adminUploadImportAction } from "../../actions-org";

export const metadata = { title: "CSV一括登録" };

export default async function AdminImportPage({ searchParams }: { searchParams: Promise<{ company?: string; id?: string }> }) {
  const u = await requireStaff(WRITE);
  const sp = await searchParams;
  const db = await getDb();
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const company = companies.find((c) => c.id === sp.company);
  const imp = sp.id && /^[0-9a-f-]{36}$/.test(sp.id) ? (await db.select().from(schema.memberImports).where(eq(schema.memberImports.id, sp.id)))[0] : undefined;
  return (
    <StaffShell user={u} title={`CSV一括登録${company ? `（${company.name}）` : ""}`} crumbs={[{ href: "/admin/members", label: "会員" }]}>
      {imp && imp.status === "preview" ? (
        <ImportPreview
          plan={imp.plan as ImportPlan}
          importId={imp.id}
          fileName={imp.fileName}
          applyAction={adminApplyImportAction}
          discardAction={adminDiscardImportAction}
        />
      ) : (
        <ImportUpload
          action={adminUploadImportAction}
          hidden={
            <label className="field">
              <span>企業</span>
              <select name="companyId" defaultValue={company?.id ?? ""} required>
                <option value="">選んでください</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          }
        />
      )}
    </StaffShell>
  );
}
