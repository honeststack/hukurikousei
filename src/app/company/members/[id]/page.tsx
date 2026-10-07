import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { MEMBER_STATUS_LABEL, memberStatus } from "@/lib/members";
import { memberInCompany } from "@/lib/scope";
import { fmtDateTime, jstDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MemberFields } from "@/components/member-fields";
import { StaffShell } from "@/components/staff-shell";
import { inviteMemberAction, updateMemberAction } from "../../actions";

export const metadata = { title: "会員の詳細" };

export default async function CompanyMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["company"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const m = await memberInCompany(id, u.companyId!);
  if (!m) notFound();
  const today = jstDate(new Date());
  const st = memberStatus(m, today);
  return (
    <StaffShell user={u} title={m.name} crumbs={[{ href: "/company/members", label: "会員" }]}>
      <div className="grid-2">
        <section className="panel">
          <h2>状態</h2>
          <dl className="kv">
            <dt>状態</dt>
            <dd>{MEMBER_STATUS_LABEL[st]}</dd>
            <dt>ご案内メール</dt>
            <dd>{fmtDateTime(m.invitedAt)}</dd>
            <dt>最終ログイン</dt>
            <dd>{fmtDateTime(m.lastLoginAt)}</dd>
          </dl>
          {!m.passwordHash && st !== "stopped" && (
            <ActionForm action={inviteMemberAction}>
              <input type="hidden" name="memberId" value={m.id} />
              <p className="small" style={{ marginTop: 12 }}>
                初回設定がまだです。メールが届いていない場合は再送してください。
              </p>
              <SubmitButton className="btn btn-sm">ご案内メールを再送</SubmitButton>
            </ActionForm>
          )}
        </section>
        <section className="panel">
          <h2>退職・休職のとき</h2>
          <p className="small">
            「利用停止日」に最終出社日の翌日などを入れて保存してください。その日から入館できなくなり、残りのポイントは無効になります（ご請求の対象からも外れます）。
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>登録内容</h2>
        <ActionForm action={updateMemberAction}>
          <input type="hidden" name="memberId" value={m.id} />
          <MemberFields m={m} today={today} />
          <SubmitButton>保存する</SubmitButton>
        </ActionForm>
      </section>
    </StaffShell>
  );
}
