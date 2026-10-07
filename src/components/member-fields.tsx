type M = {
  employeeNo?: string;
  name?: string;
  nameKana?: string;
  email?: string;
  department?: string;
  startsOn?: string;
  stopsOn?: string | null;
};

/** 会員の入力欄（企業画面・運営画面で共通） */
export function MemberFields({ m, today }: { m?: M; today: string }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>社員番号</span>
        <input name="employeeNo" defaultValue={m?.employeeNo} required maxLength={40} />
      </label>
      <label className="field">
        <span>氏名</span>
        <input name="name" defaultValue={m?.name} required maxLength={60} placeholder="山田 花子" />
      </label>
      <label className="field">
        <span>フリガナ</span>
        <input name="nameKana" defaultValue={m?.nameKana} maxLength={60} placeholder="ヤマダ ハナコ" />
      </label>
      <label className="field">
        <span>メールアドレス</span>
        <input name="email" type="email" defaultValue={m?.email} required />
        <span className="hint">会員証のご案内を送ります。ログインIDになります</span>
      </label>
      <label className="field">
        <span>部署</span>
        <input name="department" defaultValue={m?.department} maxLength={60} />
      </label>
      <label className="field">
        <span>利用開始日</span>
        <input name="startsOn" type="date" defaultValue={m?.startsOn ?? today} required />
      </label>
      <label className="field">
        <span>利用停止日</span>
        <input name="stopsOn" type="date" defaultValue={m?.stopsOn ?? ""} />
        <span className="hint">退職・休職などで使えなくなる日。この日から入館できず、残りのポイントは無効になります</span>
      </label>
    </div>
  );
}

export function memberFormData(fd: FormData) {
  const s = (k: string) => String(fd.get(k) ?? "").trim();
  return {
    employeeNo: s("employeeNo"),
    name: s("name"),
    nameKana: s("nameKana"),
    email: s("email"),
    department: s("department"),
    startsOn: s("startsOn"),
    stopsOn: s("stopsOn") || null,
  };
}
