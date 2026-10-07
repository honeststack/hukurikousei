import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { resolvePrice } from "@/lib/pricing";
import { addDays, jstDate, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { addPriceAction, saveCourseAction } from "../../actions-facility";

type Facility = typeof schema.facilities.$inferSelect;

export async function CoursesTab({ facility, canWrite }: { facility: Facility; canWrite: boolean }) {
  const db = await getDb();
  const courses = await db.select().from(schema.courses).where(eq(schema.courses.facilityId, facility.id)).orderBy(asc(schema.courses.sort));
  const prices = courses.length
    ? await db.select().from(schema.coursePrices).where(inArray(schema.coursePrices.courseId, courses.map((c) => c.id))).orderBy(asc(schema.coursePrices.effectiveFrom))
    : [];
  const today = jstDate(new Date());
  return (
    <>
      <p className="small">
        料金は「適用開始日」ごとに登録します。改定するときは新しい適用開始日で登録してください。過去の入館は入館時点の料金で記録されているため、精算額は変わりません。
      </p>
      {courses.map((c) => {
        const list = prices.filter((p) => p.courseId === c.id);
        const cur = resolvePrice(list, today);
        return (
          <section className="panel" key={c.id} style={c.active ? undefined : { opacity: 0.6 }}>
            <h2>
              <span>
                {c.name}
                {!c.active && <span className="hanko hanko-mute" style={{ marginLeft: 8 }}>非表示</span>}
              </span>
              <span className="num">{cur ? `${num(cur.points)}pt／施設価格 ${yen(cur.listPrice)}` : "料金未設定"}</span>
            </h2>
            <div className="grid-2">
              <div>
                <table className="daicho">
                  <thead>
                    <tr>
                      <th>適用開始日</th>
                      <th className="r">必要pt</th>
                      <th className="r">施設価格</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((p) => (
                      <tr key={p.id}>
                        <td>{p.effectiveFrom.replace(/-/g, "/")}</td>
                        <td className="r">{num(p.points)}</td>
                        <td className="r">{yen(p.listPrice)}</td>
                        <td className="small">{cur?.id === p.id ? "適用中" : p.effectiveFrom > today ? "予定" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {canWrite && (
                  <ActionForm action={addPriceAction} resetOnOk>
                    <input type="hidden" name="courseId" value={c.id} />
                    <div className="filters" style={{ marginTop: 10 }}>
                      <label className="field">
                        <span>適用開始日</span>
                        <input type="date" name="effectiveFrom" defaultValue={addDays(today, 1)} required />
                      </label>
                      <label className="field">
                        <span>必要pt</span>
                        <input name="points" inputMode="numeric" required style={{ width: 100 }} />
                      </label>
                      <label className="field">
                        <span>施設価格（円）</span>
                        <input name="listPrice" inputMode="numeric" required style={{ width: 110 }} />
                      </label>
                      <SubmitButton className="btn btn-sm">料金を登録</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </div>
              <ActionForm action={saveCourseAction}>
                <input type="hidden" name="facilityId" value={facility.id} />
                <input type="hidden" name="courseId" value={c.id} />
                <div className="form-grid">
                  <label className="field">
                    <span>コース名</span>
                    <input name="name" defaultValue={c.name} required />
                  </label>
                  <label className="field">
                    <span>含まれるもの</span>
                    <input name="includes" defaultValue={c.includes} />
                  </label>
                  <label className="field">
                    <span>利用時間</span>
                    <input name="durationText" defaultValue={c.durationText} />
                  </label>
                  <label className="field">
                    <span>表示順</span>
                    <input name="sort" inputMode="numeric" defaultValue={c.sort} />
                  </label>
                </div>
                <label className="check" style={{ marginBottom: 8 }}>
                  <input type="checkbox" name="active" defaultChecked={c.active} />
                  会員に表示する
                </label>
                {canWrite && <SubmitButton className="btn btn-sm">コースを保存</SubmitButton>}
              </ActionForm>
            </div>
          </section>
        );
      })}
      {canWrite && (
        <section className="panel">
          <h2>コースを追加</h2>
          <ActionForm action={saveCourseAction} resetOnOk>
            <input type="hidden" name="facilityId" value={facility.id} />
            <input type="hidden" name="active" value="on" />
            <div className="form-grid">
              <label className="field">
                <span>コース名</span>
                <input name="name" required placeholder="入浴＋岩盤浴" />
              </label>
              <label className="field">
                <span>含まれるもの</span>
                <input name="includes" placeholder="館内着・タオルセット" />
              </label>
              <label className="field">
                <span>利用時間</span>
                <input name="durationText" placeholder="当日中" />
              </label>
              <label className="field">
                <span>表示順</span>
                <input name="sort" inputMode="numeric" defaultValue={courses.length} />
              </label>
              <label className="field">
                <span>必要pt</span>
                <input name="points" inputMode="numeric" required />
              </label>
              <label className="field">
                <span>施設価格（円）</span>
                <input name="listPrice" inputMode="numeric" required />
              </label>
              <label className="field">
                <span>料金の適用開始日</span>
                <input type="date" name="effectiveFrom" defaultValue={today} required />
              </label>
            </div>
            <SubmitButton>追加</SubmitButton>
          </ActionForm>
        </section>
      )}
    </>
  );
}
