import { and, asc, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, fmtDate, jstDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { closureAction, specialDayAction } from "../../actions-facility";

type Facility = typeof schema.facilities.$inferSelect;

export async function CalendarTab({ facility, canWrite }: { facility: Facility; canWrite: boolean }) {
  const db = await getDb();
  const from = addDays(jstDate(new Date()), -30);
  const closures = await db
    .select()
    .from(schema.facilityClosures)
    .where(and(eq(schema.facilityClosures.facilityId, facility.id), gte(schema.facilityClosures.date, from)))
    .orderBy(asc(schema.facilityClosures.date));
  const specials = await db
    .select()
    .from(schema.specialDays)
    .where(and(eq(schema.specialDays.facilityId, facility.id), gte(schema.specialDays.date, from)))
    .orderBy(asc(schema.specialDays.date));
  const del = (action: typeof closureAction, id: string) =>
    canWrite && (
      <ActionForm action={action}>
        <input type="hidden" name="facilityId" value={facility.id} />
        <input type="hidden" name="op" value="delete" />
        <input type="hidden" name="id" value={id} />
        <SubmitButton className="btn btn-sm btn-link">削除</SubmitButton>
      </ActionForm>
    );
  return (
    <div className="grid-2">
      <section className="panel">
        <h2>臨時休館日</h2>
        <p className="small">この日は会員が入館できず、施設一覧に「本日休館」と表示されます。定休日は「基本情報」で設定します。</p>
        <table className="daicho">
          <tbody>
            {closures.length === 0 && (
              <tr>
                <td className="empty">登録はありません</td>
              </tr>
            )}
            {closures.map((c) => (
              <tr key={c.id}>
                <td>{fmtDate(c.date)}</td>
                <td>{c.note}</td>
                <td>{del(closureAction, c.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && (
          <ActionForm action={closureAction} resetOnOk>
            <input type="hidden" name="facilityId" value={facility.id} />
            <input type="hidden" name="op" value="add" />
            <div className="filters" style={{ marginTop: 10 }}>
              <label className="field">
                <span>日付</span>
                <input type="date" name="date" required />
              </label>
              <label className="field">
                <span>理由（会員に表示）</span>
                <input name="note" placeholder="設備点検" />
              </label>
              <SubmitButton className="btn btn-sm">追加</SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
      <section className="panel">
        <h2>この施設だけの特別料金日</h2>
        <p className="small">「特別料金日」にチェックした追加料金がかかる日です。全施設共通の日は「祝日・特別料金日」で登録します。</p>
        <table className="daicho">
          <tbody>
            {specials.length === 0 && (
              <tr>
                <td className="empty">登録はありません</td>
              </tr>
            )}
            {specials.map((s) => (
              <tr key={s.id}>
                <td>{fmtDate(s.date)}</td>
                <td>{s.label}</td>
                <td>{del(specialDayAction, s.id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canWrite && (
          <ActionForm action={specialDayAction} resetOnOk>
            <input type="hidden" name="facilityId" value={facility.id} />
            <input type="hidden" name="op" value="add" />
            <div className="filters" style={{ marginTop: 10 }}>
              <label className="field">
                <span>から</span>
                <input type="date" name="from" required />
              </label>
              <label className="field">
                <span>まで</span>
                <input type="date" name="to" />
              </label>
              <label className="field">
                <span>名称</span>
                <input name="label" placeholder="周年祭" />
              </label>
              <SubmitButton className="btn btn-sm">追加</SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
