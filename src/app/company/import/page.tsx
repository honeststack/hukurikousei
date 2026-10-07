import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import type { ImportPlan } from "@/lib/members";
import { ImportPreview } from "@/components/import-preview";
import { ImportUpload } from "@/components/import-upload";
import { StaffShell } from "@/components/staff-shell";
import { applyImportAction, discardImportAction, uploadImportAction } from "../actions";

export const metadata = { title: "CSV一括登録" };

export default async function CompanyImportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const u = await requireStaff(["company"]);
  const { id } = await searchParams;
  const db = await getDb();
  const imp =
    id && /^[0-9a-f-]{36}$/.test(id)
      ? (
          await db
            .select()
            .from(schema.memberImports)
            .where(and(eq(schema.memberImports.id, id), eq(schema.memberImports.companyId, u.companyId!)))
        )[0]
      : undefined;
  return (
    <StaffShell user={u} title="CSV一括登録" crumbs={[{ href: "/company/members", label: "会員" }]}>
      {imp && imp.status === "preview" ? (
        <ImportPreview
          plan={imp.plan as ImportPlan}
          importId={imp.id}
          fileName={imp.fileName}
          applyAction={applyImportAction}
          discardAction={discardImportAction}
        />
      ) : (
        <>
          {imp && <p className="notice">この取り込みはすでに{imp.status === "applied" ? "反映" : "取り消し"}されています。</p>}
          <ImportUpload action={uploadImportAction} />
        </>
      )}
    </StaffShell>
  );
}
