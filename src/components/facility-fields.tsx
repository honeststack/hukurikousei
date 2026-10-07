import { fmtMinutes, WEEKDAYS_JA } from "@/lib/time";

type F = {
  operatorId?: string;
  name?: string;
  nameKana?: string;
  area?: string;
  address?: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
  hoursText?: string;
  daySwitchMinutes?: number;
  closedWeekdays?: number;
  openOnHolidays?: boolean;
  description?: string;
  notes?: string;
  status?: string;
};

export function WeekdayChecks({ name, mask }: { name: string; mask: number }) {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {WEEKDAYS_JA.map((w, i) => (
        <label key={w} className="check">
          <input type="checkbox" name={name} value={i} defaultChecked={!!(mask & (1 << i))} />
          {w}
        </label>
      ))}
    </div>
  );
}

export function FacilityFields({ f, operators }: { f?: F; operators: { id: string; name: string }[] }) {
  return (
    <>
      <div className="form-grid">
        <label className="field">
          <span>運営会社（精算の支払先）</span>
          <select name="operatorId" defaultValue={f?.operatorId ?? ""} required>
            <option value="">選んでください</option>
            {operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>施設名</span>
          <input name="name" defaultValue={f?.name} required />
        </label>
        <label className="field">
          <span>フリガナ</span>
          <input name="nameKana" defaultValue={f?.nameKana} />
        </label>
        <label className="field">
          <span>エリア（一覧の見出し）</span>
          <input name="area" defaultValue={f?.area} placeholder="東京都港区" />
        </label>
        <label className="field">
          <span>住所</span>
          <input name="address" defaultValue={f?.address} />
        </label>
        <label className="field">
          <span>電話</span>
          <input name="phone" defaultValue={f?.phone} />
        </label>
        <label className="field">
          <span>緯度</span>
          <input name="lat" defaultValue={f?.lat ?? ""} placeholder="35.6425" />
          <span className="hint">地図アプリで施設を長押しすると表示されます</span>
        </label>
        <label className="field">
          <span>経度</span>
          <input name="lng" defaultValue={f?.lng ?? ""} placeholder="139.7487" />
        </label>
        <label className="field">
          <span>営業時間（表示用）</span>
          <input name="hoursText" defaultValue={f?.hoursText} placeholder="10:00〜翌9:00" />
        </label>
        <label className="field">
          <span>営業日の切替時刻</span>
          <input name="daySwitch" defaultValue={fmtMinutes(f?.daySwitchMinutes ?? 300)} required />
          <span className="hint">この時刻より前の入館は前日の営業日として扱います（1日1回・土日祝の判定に使用）</span>
        </label>
        <label className="field">
          <span>状態</span>
          <select name="status" defaultValue={f?.status ?? "active"}>
            <option value="active">提携中</option>
            <option value="suspended">停止（会員に表示しない・入館不可）</option>
          </select>
        </label>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <span>定休日</span>
        <WeekdayChecks name="weekdays" mask={f?.closedWeekdays ?? 0} />
        <label className="check">
          <input type="checkbox" name="openOnHolidays" defaultChecked={f?.openOnHolidays ?? true} />
          定休日でも祝日は営業する
        </label>
      </fieldset>
      <label className="field">
        <span>紹介文（会員に表示）</span>
        <textarea name="description" defaultValue={f?.description} />
      </label>
      <label className="field">
        <span>備考（会員に表示）</span>
        <input name="notes" defaultValue={f?.notes} placeholder="館内着・タオルはコースに含まれます" />
      </label>
    </>
  );
}
