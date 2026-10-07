import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { addDays, fmtDateTime, jstDate, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CompanyFields } from "@/components/company-fields";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../../_ctx";
import { addContractAction, createStaffAction, endContractAction, saveCompanyAction } from "../../actions-org";

export const metadata = { title: "導入企業" };

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const u = await requireStaff(READ);
  const { id } = await params;
  const { ok } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [c] = await db.select().from(schema.companies).where(eq(schema.companies.id, id));
  if (!c) notFound();
  const contracts = await db.select().from(schema.contracts).where(eq(schema.contracts.companyId, id)).orderBy(desc(schema.contracts.startsOn));
  const scoped = contracts.length
    ? await db.select().from(schema.contractFacilities).where(inArray(schema.contractFacilities.contractId, contracts.map((x) => x.id)))
    : [];
  const facilities = await db.select().from(schema.facilities).orderBy(asc(schema.facilities.name));
  const staff = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.companyId, id));
  const today = jstDate(new Date());
  const canWrite = u.role !== "viewer";
  const fname = (fid: string) => facilities.find((f) => f.id === fid)?.name ?? "";

  return (
    <StaffShell
      user={u}
      title={c.name}
      crumbs={[{ href: "/admin/companies", label: "導入企業" }]}
      actions={
        <>
          <Link className="btn btn-sm" href={`/admin/members?company=${c.id}`}>
            会員を見る
          </Link>
          <Link className="btn btn-sm" href={`/admin/members/import?company=${c.id}`}>
            CSV一括登録
          </Link>
          <a className="btn btn-sm" href={`/print/kit/${c.id}`} target="_blank" rel="noopener">
            社内周知用の案内
          </a>
        </>
      }
    >
      {ok === "created" && <p className="notice notice-ok">企業を登録しました。続けて契約を設定してください。</p>}
      {ok === "contract" && <p className="notice notice-ok">契約を追加しました。適用開始日より前の期間は、それまでの契約が使われます。</p>}
      {contracts.length === 0 && <p className="notice notice-error">契約がありません。契約を追加するまで、会員は入館できず、ポイントも付与されません。</p>}

      <section className="panel panel-tight">
        <h2>契約（新しい順）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>期間</th>
              <th className="r">毎月の付与</th>
              <th>繰越</th>
              <th>月途中の開始者</th>
              <th>対象施設</th>
              <th>請求</th>
              <th>個人別の開示</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((k) => {
              const live = k.startsOn <= today && (!k.endsOn || k.endsOn >= today);
              return (
                <tr key={k.id}>
                  <td>
                    {k.startsOn.replace(/-/g, "/")}〜{k.endsOn?.replace(/-/g, "/") ?? ""}
                    {live && <span className="hanko hanko-take" style={{ marginLeft: 6 }}>適用中</span>}
                  </td>
                  <td className="r">{num(k.monthlyPoints)}pt</td>
                  <td className="small">{k.carryover === "cap" ? `${num(k.carryoverCap)}ptまで` : "なし"}</td>
                  <td className="small">{k.midMonthGrant === "full" ? "開始日に当月分" : "翌月1日から"}</td>
                  <td className="small">
                    {k.facilityScope === "all"
                      ? "全施設"
                      : scoped
                          .filter((s) => s.contractId === k.id)
                          .map((s) => fname(s.facilityId))
                          .join("、")}
                  </td>
                  <td className="small">{k.billingBasis === "per_member" ? `1名 ${yen(k.feePerMember)}／月` : "利用分"}</td>
                  <td className="small">{k.showIndividualUsage ? "開示する" : "集計のみ"}</td>
                  <td>
                    {canWrite && !k.endsOn && (
                      <details>
                        <summary className="btn btn-sm" style={{ listStyle: "none" }}>
                          終了日
                        </summary>
                        <ActionForm action={endContractAction}>
                          <input type="hidden" name="contractId" value={k.id} />
                          <input type="date" name="endsOn" required className="input" style={{ margin: "6px 0" }} />
                          <SubmitButton className="btn btn-sm">設定</SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {canWrite && (
        <details className="fold" open={contracts.length === 0}>
          <summary>契約を追加（条件の変更も「新しい適用開始日の契約」として追加します）</summary>
          <div>
            <ActionForm action={addContractAction}>
              <input type="hidden" name="companyId" value={c.id} />
              <div className="form-grid">
                <label className="field">
                  <span>適用開始日</span>
                  <input type="date" name="startsOn" required defaultValue={contracts.length ? addDays(today, 1) : today} />
                </label>
                <label className="field">
                  <span>終了日（任意）</span>
                  <input type="date" name="endsOn" />
                </label>
                <label className="field">
                  <span>毎月の付与ポイント</span>
                  <input name="monthlyPoints" inputMode="numeric" required defaultValue={contracts[0]?.monthlyPoints ?? 5000} />
                </label>
                <label className="field">
                  <span>繰越</span>
                  <select name="carryover" defaultValue={contracts[0]?.carryover ?? "none"}>
                    <option value="none">なし（月末で失効）</option>
                    <option value="cap">上限まで翌月へ繰越</option>
                  </select>
                </label>
                <label className="field">
                  <span>繰越の上限（pt）</span>
                  <input name="carryoverCap" inputMode="numeric" defaultValue={contracts[0]?.carryoverCap ?? 0} />
                </label>
                <label className="field">
                  <span>月途中の利用開始者</span>
                  <select name="midMonthGrant" defaultValue={contracts[0]?.midMonthGrant ?? "full"}>
                    <option value="full">開始日に当月分を全額付与</option>
                    <option value="next">翌月1日から付与</option>
                  </select>
                </label>
                <label className="field">
                  <span>請求の基準</span>
                  <select name="billingBasis" defaultValue={contracts[0]?.billingBasis ?? "per_member"}>
                    <option value="per_member">会員数 × 月額</option>
                    <option value="usage">利用分（利用pt × 換算率）</option>
                  </select>
                </label>
                <label className="field">
                  <span>会員1名あたり月額（円）</span>
                  <input name="feePerMember" inputMode="numeric" defaultValue={contracts[0]?.feePerMember ?? 0} />
                </label>
                <label className="field">
                  <span>対象施設</span>
                  <select name="facilityScope" defaultValue={contracts[0]?.facilityScope ?? "all"}>
                    <option value="all">全提携施設</option>
                    <option value="selected">下で選んだ施設のみ</option>
                  </select>
                </label>
              </div>
              <fieldset className="field" style={{ border: 0, padding: 0 }}>
                <span>施設（「選んだ施設のみ」の場合）</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>
                  {facilities.map((f) => (
                    <label key={f.id} className="check">
                      <input type="checkbox" name="facilities" value={f.id} />
                      {f.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="check" style={{ marginBottom: 12 }}>
                <input type="checkbox" name="showIndividualUsage" defaultChecked={contracts[0]?.showIndividualUsage} />
                企業画面で個人別の利用回数を開示する（契約で合意した場合のみ）
              </label>
              <SubmitButton>契約を追加</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}

      <div className="grid-2">
        <section className="panel">
          <h2>企業情報</h2>
          <ActionForm action={saveCompanyAction}>
            <input type="hidden" name="id" value={c.id} />
            <CompanyFields c={c} />
            {canWrite && <SubmitButton>保存</SubmitButton>}
          </ActionForm>
        </section>
        <section className="panel">
          <h2>企業の担当者アカウント</h2>
          <table className="daicho">
            <tbody>
              {staff.length === 0 && (
                <tr>
                  <td className="empty">まだいません</td>
                </tr>
              )}
              {staff.map((s) => (
                <tr key={s.id} className={s.active ? undefined : "is-off"}>
                  <td>{s.name}</td>
                  <td className="small">{s.email}</td>
                  <td className="small">{s.passwordHash ? `最終 ${fmtDateTime(s.lastLoginAt)}` : "初回設定まだ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {u.role === "admin" && (
            <ActionForm action={createStaffAction} resetOnOk>
              <input type="hidden" name="role" value="company" />
              <input type="hidden" name="companyId" value={c.id} />
              <div className="form-grid" style={{ marginTop: 12 }}>
                <label className="field">
                  <span>氏名</span>
                  <input name="name" required />
                </label>
                <label className="field">
                  <span>メール</span>
                  <input name="email" type="email" required />
                </label>
              </div>
              <SubmitButton className="btn btn-sm">担当者を追加して招待</SubmitButton>
            </ActionForm>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
