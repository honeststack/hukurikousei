import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FacilityFields } from "@/components/facility-fields";
import { StaffShell } from "@/components/staff-shell";
import { WRITE } from "../../_ctx";
import { saveFacilityAction } from "../../actions-facility";

export const metadata = { title: "施設を登録" };

export default async function NewFacilityPage() {
  const u = await requireStaff(WRITE);
  const db = await getDb();
  const operators = await db.select().from(schema.operators).orderBy(asc(schema.operators.name));
  return (
    <StaffShell user={u} title="施設を登録" crumbs={[{ href: "/admin/facilities", label: "提携施設" }]}>
      {operators.length === 0 && (
        <p className="notice notice-error">
          先に<Link href="/admin/operators">施設の運営会社</Link>を登録してください。
        </p>
      )}
      <section className="panel">
        <ActionForm action={saveFacilityAction}>
          <FacilityFields operators={operators} />
          <SubmitButton>登録してコースの設定へ</SubmitButton>
          <p className="small mute" style={{ marginTop: 8 }}>
            登録すると受付用のQRコードが1つ発行されます。続けてコース・追加料金・精算条件を設定してください。
          </p>
        </ActionForm>
      </section>
    </StaffShell>
  );
}
