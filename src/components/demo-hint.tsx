"use client";

export const DEMO_PASSWORD = "yufuda2026";

/** 公開デモで、ログイン欄にデモ用アカウントを入れるボタン */
export function DemoAccounts({ accounts }: { accounts: { label: string; email: string }[] }) {
  function fill(email: string) {
    const set = (name: string, value: string) => {
      const el = document.querySelector<HTMLInputElement>(`input[name="${name}"]`);
      if (!el) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("email", email);
    set("password", DEMO_PASSWORD);
  }
  return (
    <div className="card small" style={{ marginBottom: 20 }}>
      <div className="en" style={{ color: "var(--brass-deep)", marginBottom: 4 }}>
        Demo
      </div>
      <b>デモ用のアカウント</b>
      <p className="mute" style={{ margin: "2px 0 10px" }}>
        押すと入力されます。そのまま「ログイン」を押してください。パスワードはすべて {DEMO_PASSWORD} です。
      </p>
      <div style={{ display: "grid", gap: 8 }}>
        {accounts.map((a) => (
          <button key={a.email} type="button" className="btn btn-sm" style={{ justifyContent: "space-between" }} onClick={() => fill(a.email)}>
            <span>{a.label}</span>
            <span className="mute">{a.email}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
