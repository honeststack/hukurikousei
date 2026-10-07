import { and, asc, gte, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDate, jstDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { holidayAction, specialDayAction } from "../actions-facility";

export const metadata = { title: "祝日・特別料金日" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ y?: string }> }) {
  const u = await requireStaff(READ);
  const { y } = await searchParams;
  const year = y && /^\d{4}$/.test(y) ? Number(y) : Number(jstDate(new Date()).slice(0, 4));
  const db = await getDb();
  const holidays = await db
    .select()
    .from(schema.holidays)
    .where(and(gte(schema.holidays.date, `${year}-01-01`), lte(schema.holidays.date, `${year}-12-31`)))
    .orderBy(asc(schema.holidays.date));
  const specials = await db
    .select()
    .from(schema.specialDays)
    .where(and(isNull(schema.specialDays.facilityId), gte(schema.specialDays.date, `${year}-01-01`), lte(schema.specialDays.date, `${year}-12-31`)))
    .orderBy(asc(schema.specialDays.date));
  const [nextYear] = await db.select().from(schema.holidays).where(gte(schema.holidays.date, `${year + 1}-01-01`)).limit(1);
  const canWrite = u.role !== "viewer";
  return (
    <StaffShell user={u} title="祝日・特別料金日">
      <nav className="filters" aria-label="年">
        <a className="btn btn-sm" href={`/admin/calendar?y=${year - 1}`}>
          ‹ {year - 1}年
        </a>
        <b className="mincho" style={{ fontSize: "1.2rem" }}>
          {year}年
        </b>
        <a className="btn btn-sm" href={`/admin/calendar?y=${year + 1}`}>
          {year + 1}年 ›
        </a>
      </nav>
      {!nextYear && <p className="notice">翌年（{year + 1}年）の祝日が未登録です。内閣府が例年2月頃に公表するCSVを取り込んでください。</p>}
      <div className="grid-2">
        <section className="panel">
          <h2>祝日（{holidays.length}日）</h2>
          {canWrite && (
            <ActionForm action={holidayAction}>
              <input type="hidden" name="op" value="import" />
              <div className="filters">
                <label className="field">
                  <span>
                    内閣府「国民の祝日」CSV（
                    <a href="https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html" target="_blank" rel="noopener noreferrer">
                      配布ページ
                    </a>
                    ）
                  </span>
                  <input type="file" name="file" accept=".csv" required />
                </label>
                <SubmitButton className="btn btn-sm">取り込む</SubmitButton>
              </div>
            </ActionForm>
          )}
          <table className="daicho">
            <tbody>
              {holidays.map((h) => (
                <tr key={h.date}>
                  <td>{fmtDate(h.date)}</td>
                  <td>{h.name}</td>
                  <td>
                    {canWrite && (
                      <ActionForm action={holidayAction}>
                        <input type="hidden" name="op" value="delete" />
                        <input type="hidden" name="date" value={h.date} />
                        <SubmitButton className="btn btn-sm btn-link">削除</SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite && (
            <ActionForm action={holidayAction} resetOnOk>
              <input type="hidden" name="op" value="add" />
              <div className="filters" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>日付</span>
                  <input type="date" name="date" required />
                </label>
                <label className="field">
                  <span>名称</span>
                  <input name="name" placeholder="休日" />
                </label>
                <SubmitButton className="btn btn-sm">追加</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
        <section className="panel">
          <h2>全施設共通の特別料金日</h2>
          <p className="small">GW・お盆・年末年始など。各施設の追加料金で「特別料金日」にチェックしたものが、この日に適用されます。</p>
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
                  <td>
                    {canWrite && (
                      <ActionForm action={specialDayAction}>
                        <input type="hidden" name="op" value="delete" />
                        <input type="hidden" name="id" value={s.id} />
                        <SubmitButton className="btn btn-sm btn-link">削除</SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite && (
            <ActionForm action={specialDayAction} resetOnOk>
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
                  <input name="label" placeholder="お盆" />
                </label>
                <SubmitButton className="btn btn-sm">追加</SubmitButton>
              </div>
            </ActionForm>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
