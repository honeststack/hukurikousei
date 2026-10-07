import { requireStaff } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CompanyFields } from "@/components/company-fields";
import { StaffShell } from "@/components/staff-shell";
import { WRITE } from "../../_ctx";
import { saveCompanyAction } from "../../actions-org";

export const metadata = { title: "企業を登録" };

export default async function NewCompanyPage() {
  const u = await requireStaff(WRITE);
  return (
    <StaffShell user={u} title="企業を登録" crumbs={[{ href: "/admin/companies", label: "導入企業" }]}>
      <section className="panel">
        <ActionForm action={saveCompanyAction}>
          <CompanyFields />
          <SubmitButton>登録して契約の設定へ</SubmitButton>
        </ActionForm>
      </section>
    </StaffShell>
  );
}
