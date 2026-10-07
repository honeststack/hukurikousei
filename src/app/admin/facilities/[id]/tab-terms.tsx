import { asc, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { latestEffective, METHOD_LABEL } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { addDays, jstDate, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addTermAction } from "../../actions-facility";

type Facility = typeof schema.facilities.$inferSelect;

export async function TermsTab({ facility, canWrite }: { facility: Facility; canWrite: boolean }) {
  const db = await getDb();
  const terms = await db.select().from(schema.settlementTerms).where(eq(schema.settlementTerms.facilityId, facility.id)).orderBy(desc(schema.settlementTerms.effectiveFrom));
  const courses = await db.select().from(schema.courses).where(eq(schema.courses.facilityId, facility.id)).orderBy(asc(schema.courses.sort));
  const today = jstDate(new Date());
  const { yenPerPoint } = await getSettings(db);
  const cname = (id: string | null) => (id ? courses.find((c) => c.id === id)?.name ?? "（削除済み）" : "施設全体（既定）");
  return (
    <>
      <section className="panel">
        <h2>精算方式</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
          <li>
            <b>{METHOD_LABEL.points_ratio}</b>：会員が使ったポイント分だけ支払う（1pt＝{yenPerPoint}円）。ポイント不足分は施設が店頭で受け取るため含まない
          </li>
          <li>
            <b>{METHOD_LABEL.list_ratio}</b>：施設定価に比率を掛け、店頭で受け取った不足分を差し引く
          </li>
          <li>
            <b>{METHOD_LABEL.unit}</b>：1入館ごとに定額。店頭で受け取った不足分を差し引く
          </li>
        </ul>
        <p className="small mute" style={{ margin: "6px 0 0" }}>追加料金（土日祝・深夜など）は施設の売上で、精算には含みません。1円未満は切り捨てます。</p>
      </section>
      <section className="panel panel-tight">
        <h2>登録されている条件（新しい順）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>対象</th>
              <th>適用開始日</th>
              <th>方式</th>
              <th className="r">比率／定額</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {terms.length === 0 && (
              <tr>
                <td colSpan={5} className="empty" style={{ color: "var(--shu)" }}>
                  精算条件が未設定です。入館の精算額が0円になります。
                </td>
              </tr>
            )}
            {terms.map((t) => {
              const current = latestEffective(terms.filter((x) => x.courseId === t.courseId), today)?.id === t.id;
              return (
                <tr key={t.id}>
                  <td>{cname(t.courseId)}</td>
                  <td>{t.effectiveFrom.replace(/-/g, "/")}</td>
                  <td className="small">{METHOD_LABEL[t.method]}</td>
                  <td className="r">{t.method === "unit" ? yen(t.unitPrice) : `${t.ratioBp / 100}%`}</td>
                  <td className="small">{t.effectiveFrom > today ? "予定" : current ? "適用中" : "過去"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {canWrite && (
        <section className="panel">
          <h2>条件を追加（変更も新しい適用開始日で追加）</h2>
          <ActionForm action={addTermAction} resetOnOk>
            <input type="hidden" name="facilityId" value={facility.id} />
            <div className="form-grid">
              <label className="field">
                <span>対象</span>
                <select name="courseId" defaultValue="">
                  <option value="">施設全体（既定）</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      コース個別：{c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>方式</span>
                <select name="method" defaultValue="points_ratio">
                  <option value="points_ratio">{METHOD_LABEL.points_ratio}</option>
                  <option value="list_ratio">{METHOD_LABEL.list_ratio}</option>
                  <option value="unit">{METHOD_LABEL.unit}</option>
                </select>
              </label>
              <label className="field">
                <span>比率（%）</span>
                <input name="ratio" inputMode="decimal" defaultValue="80" />
              </label>
              <label className="field">
                <span>定額（円・定額方式のみ）</span>
                <input name="unitPrice" inputMode="numeric" defaultValue="0" />
              </label>
              <label className="field">
                <span>適用開始日（営業日）</span>
                <input type="date" name="effectiveFrom" defaultValue={terms.length ? addDays(today, 1) : today} required />
              </label>
            </div>
            <SubmitButton>追加</SubmitButton>
          </ActionForm>
        </section>
      )}
    </>
  );
}
