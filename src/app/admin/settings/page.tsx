import { requireStaff } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { saveSettingsAction } from "../actions-ops";

export const metadata = { title: "設定" };

export default async function SettingsPage() {
  const u = await requireStaff(READ);
  const s = await getSettings();
  return (
    <StaffShell user={u} title="設定">
      <ActionForm action={saveSettingsAction}>
        <section className="panel">
          <h2>ポイントと入館</h2>
          <div className="form-grid">
            <label className="field">
              <span>1ポイントあたりの円</span>
              <input name="yenPerPoint" inputMode="numeric" defaultValue={s.yenPerPoint} />
              <span className="hint">ポイント不足分の店頭払い額と、精算額の計算に使います</span>
            </label>
            <label className="field">
              <span>会員が自分で取り消せる時間（分）</span>
              <input name="selfCancelMinutes" inputMode="numeric" defaultValue={s.selfCancelMinutes} />
            </label>
            <label className="field">
              <span>「施設から離れた入館」とする距離（m）</span>
              <input name="geofenceMeters" inputMode="numeric" defaultValue={s.geofenceMeters} />
            </label>
            <label className="field">
              <span>会員の同時ログイン端末数</span>
              <input name="maxMemberDevices" inputMode="numeric" defaultValue={s.maxMemberDevices} />
              <span className="hint">超えると古い端末からログアウトします（貸し借り対策）</span>
            </label>
            <label className="field">
              <span>QR再発行時の旧QRの猶予（日）</span>
              <input name="qrGraceDays" inputMode="numeric" defaultValue={s.qrGraceDays} />
            </label>
          </div>
        </section>
        <section className="panel">
          <h2>お問い合わせ先（会員・施設の画面とメールに表示）</h2>
          <div className="form-grid">
            <label className="field">
              <span>名称</span>
              <input name="supportName" defaultValue={s.supportName} />
            </label>
            <label className="field">
              <span>電話</span>
              <input name="supportPhone" defaultValue={s.supportPhone} />
            </label>
            <label className="field">
              <span>メール</span>
              <input name="supportEmail" type="email" defaultValue={s.supportEmail} />
            </label>
            <label className="field">
              <span>受付時間</span>
              <input name="supportHours" defaultValue={s.supportHours} />
            </label>
          </div>
        </section>
        {u.role === "admin" ? <SubmitButton>保存</SubmitButton> : <p className="small mute">設定の変更は運営管理者のみ行えます。</p>}
      </ActionForm>
    </StaffShell>
  );
}
