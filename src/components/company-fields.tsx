type C = { name?: string; contactName?: string; contactEmail?: string; billingAddress?: string; note?: string };

export function CompanyFields({ c }: { c?: C }) {
  return (
    <div className="form-grid">
      <label className="field">
        <span>企業名</span>
        <input name="name" defaultValue={c?.name} required />
      </label>
      <label className="field">
        <span>ご担当者</span>
        <input name="contactName" defaultValue={c?.contactName} placeholder="人事部 佐藤" />
      </label>
      <label className="field">
        <span>ご担当者のメール</span>
        <input name="contactEmail" type="email" defaultValue={c?.contactEmail} />
      </label>
      <label className="field">
        <span>請求先住所</span>
        <input name="billingAddress" defaultValue={c?.billingAddress} />
      </label>
      <label className="field" style={{ gridColumn: "1 / -1" }}>
        <span>メモ</span>
        <textarea name="note" defaultValue={c?.note} />
      </label>
    </div>
  );
}
