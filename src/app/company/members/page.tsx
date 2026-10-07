import { requireStaff } from "@/lib/auth";
import { searchMembers } from "@/lib/member-query";
import { jstDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MemberFields } from "@/components/member-fields";
import { MemberFilterForm, MembersTable } from "@/components/members-table";
import { StaffShell } from "@/components/staff-shell";
import { addMemberAction } from "../actions";

export const metadata = { title: "会員" };

export default async function CompanyMembersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; ok?: string }> }) {
  const u = await requireStaff(["company"]);
  const sp = await searchParams;
  const rows = await searchMembers({ companyId: u.companyId!, q: sp.q, status: sp.status });
  const today = jstDate(new Date());
  return (
    <StaffShell
      user={u}
      title="会員"
      actions={
        <a className="btn btn-sm" href="/api/csv/company?kind=members">
          会員一覧CSV
        </a>
      }
    >
      {sp.ok && <p className="notice notice-ok">{sp.ok}</p>}
      <details className="fold">
        <summary>会員を1名登録する</summary>
        <div>
          <ActionForm action={addMemberAction} resetOnOk>
            <MemberFields today={today} />
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" name="sendInvite" defaultChecked />
              登録後すぐに会員証のご案内メールを送る
            </label>
            <SubmitButton>登録する</SubmitButton>
          </ActionForm>
        </div>
      </details>
      <MemberFilterForm q={sp.q} status={sp.status} action="/company/members" />
      <p className="small mute">{rows.length}名</p>
      <MembersTable rows={rows} today={today} hrefBase="/company/members" />
    </StaffShell>
  );
}
