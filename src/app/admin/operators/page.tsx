import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { createStaffAction, saveOperatorAction } from "../actions-org";

export const metadata = { title: "施設の運営会社" };

function OperatorFields({ o }: { o?: { name: string; contactEmail: string; bankInfo: string; invoiceNo: string } }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>会社名</span>
        <input name="name" defaultValue={o?.name} required />
      </label>
      <label className="field">
        <span>連絡先メール</span>
        <input name="contactEmail" type="email" defaultValue={o?.contactEmail} />
      </label>
      <label className="field">
        <span>振込先</span>
        <input name="bankInfo" defaultValue={o?.bankInfo} placeholder="〇〇銀行 〇〇支店 普通 1234567 カ）〇〇" />
      </label>
      <label className="field">
        <span>適格請求書発行事業者の登録番号</span>
        <input name="invoiceNo" defaultValue={o?.invoiceNo} placeholder="T1234567890123" />
      </label>
    </div>
  );
}

export default async function OperatorsPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const ops = await db.select().from(schema.operators).orderBy(asc(schema.operators.name));
  const facilities = await db.select().from(schema.facilities);
  const staff = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.role, "facility"));
  const canWrite = u.role !== "viewer";
  return (
    <StaffShell user={u} title="施設の運営会社">
      <p className="small">精算の支払先です。複数の店舗を持つ会社は、1つの運営会社に店舗をまとめます。施設の担当者アカウントは運営会社ごとに発行し、配下の全店舗を扱えます。</p>
      {ops.map((o) => (
        <section className="panel" key={o.id}>
          <h2>
            {o.name}
            <span className="small mute">
              店舗：
              {facilities
                .filter((f) => f.operatorId === o.id)
                .map((f) => (
                  <Link key={f.id} href={`/admin/facilities/${f.id}`} style={{ marginLeft: 6 }}>
                    {f.name}
                  </Link>
                ))}
            </span>
          </h2>
          <div className="grid-2">
            <ActionForm action={saveOperatorAction}>
              <input type="hidden" name="id" value={o.id} />
              <OperatorFields o={o} />
              {canWrite && <SubmitButton className="btn btn-sm">保存</SubmitButton>}
            </ActionForm>
            <div>
              <b className="small">担当者アカウント</b>
              <table className="daicho">
                <tbody>
                  {staff
                    .filter((s) => s.operatorId === o.id)
                    .map((s) => (
                      <tr key={s.id} className={s.active ? undefined : "is-off"}>
                        <td>{s.name}</td>
                        <td className="small">{s.email}</td>
                        <td className="small">
                          {s.facilityId ? facilities.find((f) => f.id === s.facilityId)?.name : "全店舗"}
                          <br />
                          {s.passwordHash ? `最終 ${fmtDateTime(s.lastLoginAt)}` : "初回設定まだ"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {u.role === "admin" && (
                <ActionForm action={createStaffAction} resetOnOk>
                  <input type="hidden" name="role" value="facility" />
                  <input type="hidden" name="operatorId" value={o.id} />
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <label className="field">
                      <span>氏名</span>
                      <input name="name" required />
                    </label>
                    <label className="field">
                      <span>メール</span>
                      <input name="email" type="email" required />
                    </label>
                    <label className="field">
                      <span>扱う店舗</span>
                      <select name="facilityId" defaultValue="">
                        <option value="">全店舗</option>
                        {facilities
                          .filter((f) => f.operatorId === o.id)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <SubmitButton className="btn btn-sm">担当者を追加して招待</SubmitButton>
                </ActionForm>
              )}
            </div>
          </div>
        </section>
      ))}
      {canWrite && (
        <section className="panel">
          <h2>運営会社を登録</h2>
          <ActionForm action={saveOperatorAction} resetOnOk>
            <OperatorFields />
            <SubmitButton>登録</SubmitButton>
          </ActionForm>
        </section>
      )}
    </StaffShell>
  );
}
