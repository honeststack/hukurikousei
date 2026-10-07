import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { searchMembers } from "@/lib/member-query";
import { jstDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MemberFields } from "@/components/member-fields";
import { MemberFilterForm, MembersTable } from "@/components/members-table";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { adminAddMemberAction } from "../actions-org";

export const metadata = { title: "会員" };

export default async function AdminMembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; company?: string; ok?: string }> }) {
  const u = await requireStaff(READ);
  const sp = await searchParams;
  const db = await getDb();
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const company = companies.find((c) => c.id === sp.company);
  const rows = await searchMembers({ companyId: company?.id, q: sp.q, status: sp.status });
  const today = jstDate(new Date());
  return (
    <StaffShell
      user={u}
      title="会員"
      actions={
        <>
          {company && (
            <a className="btn btn-sm" href={`/api/csv/company?kind=members&company=${company.id}`}>
              会員一覧CSV
            </a>
          )}
          <Link className="btn btn-sm" href={`/admin/members/import${company ? `?company=${company.id}` : ""}`}>
            CSV一括登録
          </Link>
        </>
      }
    >
      {sp.ok && <p className="notice notice-ok">{sp.ok}</p>}
      {u.role !== "viewer" && (
        <details className="fold">
          <summary>会員を1名登録する</summary>
          <div>
            <ActionForm action={adminAddMemberAction} resetOnOk>
              <label className="field" style={{ maxWidth: 360 }}>
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
              <MemberFields today={today} />
              <label className="check" style={{ marginBottom: 12 }}>
                <input type="checkbox" name="sendInvite" defaultChecked />
                会員証のご案内メールを送る
              </label>
              <SubmitButton>登録する</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
      <MemberFilterForm
        q={sp.q}
        status={sp.status}
        action="/admin/members"
        extra={
          <label className="field">
            <span>企業</span>
            <select name="company" defaultValue={company?.id ?? ""}>
              <option value="">すべて</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        }
      />
      <p className="small mute">{rows.length}名{rows.length >= 500 && "（500名まで表示。条件で絞り込んでください）"}</p>
      <MembersTable rows={rows} today={today} hrefBase="/admin/members" showCompany />
    </StaffShell>
  );
}
