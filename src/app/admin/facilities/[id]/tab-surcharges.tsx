import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { closedReason, dayInfo, loadRules } from "@/lib/checkin";
import { computeSurcharges, isEffective, resolvePrice, weekdayMaskLabel } from "@/lib/pricing";
import { businessDate, fmtDate, fmtMinutes, isValidYmd, jstDate, jstToDate, num, parseMinutes, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { WeekdayChecks } from "@/components/facility-fields";
import { saveSurchargeAction } from "../../actions-facility";

type Facility = typeof schema.facilities.$inferSelect;
type Rule = typeof schema.surchargeRules.$inferSelect;

function RuleFields({ r, today }: { r?: Rule; today: string }) {
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>表示名（会員に表示）</span>
          <input name="label" defaultValue={r?.label} required placeholder="土日祝料金" />
        </label>
        <label className="field">
          <span>金額（円・店頭払い）</span>
          <input name="amount" inputMode="numeric" defaultValue={r?.amount} required />
        </label>
        <label className="field">
          <span>種類</span>
          <select name="kind" defaultValue={r?.kind ?? "entry"}>
            <option value="entry">入館時に加算（時間帯内の入館）</option>
            <option value="stay">滞在の予告（時間帯まで滞在したら店頭で精算）</option>
          </select>
        </label>
        <label className="field">
          <span>時間帯（開始）</span>
          <input name="timeFrom" defaultValue={fmtMinutes(r?.timeFrom)} placeholder="例 1:00（空欄で終日）" />
        </label>
        <label className="field">
          <span>時間帯（終了）</span>
          <input name="timeTo" defaultValue={fmtMinutes(r?.timeTo)} placeholder="例 5:00" />
          <span className="hint">23:00〜2:00 のように日付をまたいでも設定できます</span>
        </label>
        <label className="field">
          <span>グループ</span>
          <input name="groupKey" defaultValue={r?.groupKey} placeholder="例 day" />
          <span className="hint">同じグループは優先順位の高い1件だけ適用（空欄は常に加算）</span>
        </label>
        <label className="field">
          <span>優先順位</span>
          <input name="priority" inputMode="numeric" defaultValue={r?.priority ?? 0} />
        </label>
        <label className="field">
          <span>適用開始日</span>
          <input type="date" name="effectiveFrom" defaultValue={r?.effectiveFrom ?? today} required />
        </label>
        <label className="field">
          <span>適用終了日（任意）</span>
          <input type="date" name="effectiveTo" defaultValue={r?.effectiveTo ?? ""} />
        </label>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <span>対象の日（営業日で判定）</span>
        <WeekdayChecks name="weekdays" mask={r?.weekdays ?? 0} />
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label className="check">
            <input type="checkbox" name="onHoliday" defaultChecked={r?.onHoliday} />
            祝日
          </label>
          <label className="check">
            <input type="checkbox" name="onSpecialDay" defaultChecked={r?.onSpecialDay} />
            特別料金日（GW・年末年始など）
          </label>
          <label className="check">
            <input type="checkbox" name="active" defaultChecked={r?.active ?? true} />
            有効
          </label>
        </div>
      </fieldset>
    </>
  );
}

export async function SurchargesTab({ facility, canWrite, simDate, simTime }: { facility: Facility; canWrite: boolean; simDate?: string; simTime?: string }) {
  const db = await getDb();
  const rules = await db.select().from(schema.surchargeRules).where(eq(schema.surchargeRules.facilityId, facility.id)).orderBy(asc(schema.surchargeRules.createdAt));
  const today = jstDate(new Date());

  // 試算
  const date = simDate && isValidYmd(simDate) ? simDate : today;
  const tm = parseMinutes(simTime ?? "") ?? 18 * 60;
  const minutes = Number.isNaN(tm) ? 18 * 60 : tm;
  const at = jstToDate(date, minutes);
  const biz = businessDate(at, facility.daySwitchMinutes);
  const info = await dayInfo(db, facility.id, biz);
  const sim = computeSurcharges(await loadRules(db, facility.id), {
    businessDate: biz,
    clockMinutes: minutes,
    holidayName: info.holidayName,
    specialDayLabel: info.specialDayLabel,
  });
  const closed = closedReason(facility, biz, info.closure, info.holidayName);
  const courses = await db.select().from(schema.courses).where(and(eq(schema.courses.facilityId, facility.id), eq(schema.courses.active, true))).orderBy(asc(schema.courses.sort));
  const prices = courses.length ? await db.select().from(schema.coursePrices).where(inArray(schema.coursePrices.courseId, courses.map((c) => c.id))) : [];

  return (
    <>
      <section className="panel" style={{ borderColor: "var(--ai)" }}>
        <h2>試算：この日時に入館したら</h2>
        <form className="filters" method="get">
          <input type="hidden" name="tab" value="surcharges" />
          <label className="field">
            <span>日付</span>
            <input type="date" name="simDate" defaultValue={date} />
          </label>
          <label className="field">
            <span>時刻</span>
            <input name="simTime" defaultValue={fmtMinutes(minutes)} style={{ width: 90 }} />
          </label>
          <button className="btn btn-sm" type="submit">
            試算する
          </button>
        </form>
        <p style={{ margin: "0 0 8px" }}>
          営業日：<b>{fmtDate(biz)}</b>
          {info.holidayName && <span className="tag tag-shu" style={{ marginLeft: 6 }}>{info.holidayName}</span>}
          {info.specialDayLabel && <span className="tag tag-shu" style={{ marginLeft: 6 }}>{info.specialDayLabel}</span>}
          {closed && <span className="tag tag-mute" style={{ marginLeft: 6 }}>{closed}</span>}
        </p>
        <table className="daicho">
          <thead>
            <tr>
              <th>コース</th>
              <th className="r">必要pt</th>
              <th>追加料金（店頭）</th>
              <th className="r">店頭払い（残高十分な場合）</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((c) => {
              const p = resolvePrice(prices.filter((x) => x.courseId === c.id), biz);
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td className="r">{p ? num(p.points) : "料金なし"}</td>
                  <td className="small">{sim.applied.map((a) => `${a.label} ${yen(a.amount)}`).join("・") || "なし"}</td>
                  <td className="r">{yen(sim.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sim.notices.length > 0 && (
          <p className="small" style={{ marginTop: 8 }}>
            会員への予告：{sim.notices.map((n) => `${fmtMinutes(n.from)}以降のご滞在は ${n.label} ${yen(n.amount)}`).join("、")}
          </p>
        )}
      </section>

      <section className="panel panel-tight">
        <h2>追加料金のルール</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>表示名</th>
              <th className="r">金額</th>
              <th>対象の日</th>
              <th>時間帯</th>
              <th>種類</th>
              <th>グループ／優先</th>
              <th>適用期間</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 && (
              <tr>
                <td colSpan={8} className="empty">
                  追加料金はありません
                </td>
              </tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className={isEffective(r, today) ? undefined : "is-off"}>
                <td>
                  <b>{r.label}</b>
                </td>
                <td className="r">{yen(r.amount)}</td>
                <td className="small">{[weekdayMaskLabel(r.weekdays), r.onHoliday ? "祝日" : "", r.onSpecialDay ? "特別料金日" : ""].filter(Boolean).join("・")}</td>
                <td className="small">{r.timeFrom != null ? `${fmtMinutes(r.timeFrom)}〜${fmtMinutes(r.timeTo)}` : "終日"}</td>
                <td className="small">{r.kind === "entry" ? "入館時に加算" : "滞在の予告"}</td>
                <td className="small">
                  {r.groupKey || "—"}／{r.priority}
                </td>
                <td className="small">
                  {r.effectiveFrom.replace(/-/g, "/")}〜{r.effectiveTo?.replace(/-/g, "/") ?? ""}
                </td>
                <td>
                  {canWrite && (
                    <details>
                      <summary className="btn btn-sm" style={{ listStyle: "none" }}>
                        編集
                      </summary>
                      <div style={{ minWidth: 640, padding: "10px 0" }}>
                        <ActionForm action={saveSurchargeAction}>
                          <input type="hidden" name="facilityId" value={facility.id} />
                          <input type="hidden" name="ruleId" value={r.id} />
                          <RuleFields r={r} today={today} />
                          <SubmitButton className="btn btn-sm">保存</SubmitButton>
                        </ActionForm>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {canWrite && (
        <details className="fold">
          <summary>追加料金を追加</summary>
          <div>
            <p className="small">
              例：土日祝 +300円 → 曜日「日・土」と「祝日」にチェック、グループ「day」。年末年始 +500円 → 「特別料金日」にチェック、同じグループ「day」で優先順位を高く（土日祝料金と重ならず、高い方だけ適用）。
            </p>
            <ActionForm action={saveSurchargeAction} resetOnOk>
              <input type="hidden" name="facilityId" value={facility.id} />
              <RuleFields today={today} />
              <SubmitButton>追加</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}
