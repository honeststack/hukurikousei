import { desc, eq } from "drizzle-orm";
import QRCode from "qrcode";
import { getDb, schema } from "@/db";
import { appUrl } from "@/lib/mail";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { qrOpAction } from "../../actions-facility";

type Facility = typeof schema.facilities.$inferSelect;

export async function QrTab({ facility, canWrite }: { facility: Facility; canWrite: boolean }) {
  const db = await getDb();
  const qrs = await db.select().from(schema.facilityQrs).where(eq(schema.facilityQrs.facilityId, facility.id)).orderBy(desc(schema.facilityQrs.issuedAt));
  const now = new Date();
  const images = new Map<string, string>();
  for (const q of qrs) images.set(q.id, await QRCode.toDataURL(appUrl(`/q/${q.token}`), { margin: 1, width: 120 }));
  const op = (q: { id: string }, name: string, label: string, confirm: string, cls = "btn btn-sm") => (
    <ActionForm action={qrOpAction} confirm={confirm}>
      <input type="hidden" name="facilityId" value={facility.id} />
      <input type="hidden" name="qrId" value={q.id} />
      <input type="hidden" name="op" value={name} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ActionForm>
  );
  return (
    <>
      <p className="small">
        QRコードは施設を見分けるためのもので、それだけでは入館は成立しません。汚損・盗撮の疑いがあるときは「再発行」してください（古いQRは猶予期間の後に使えなくなります）。すぐ止める場合は「無効にする」。
      </p>
      <section className="panel panel-tight">
        <table className="daicho">
          <thead>
            <tr>
              <th>QR</th>
              <th>設置場所</th>
              <th>発行日</th>
              <th>状態</th>
              <th>掲示物</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {qrs.map((q) => {
              const dead = !!q.revokedAt || (!!q.expiresAt && q.expiresAt < now);
              return (
                <tr key={q.id} className={dead ? "is-off" : undefined}>
                  <td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={images.get(q.id)} alt="" width={72} height={72} style={{ opacity: dead ? 0.3 : 1 }} />
                  </td>
                  <td>
                    {q.label}
                    <div className="small mute" style={{ wordBreak: "break-all" }}>
                      {appUrl(`/q/${q.token}`)}
                    </div>
                  </td>
                  <td className="small">{fmtDateTime(q.issuedAt)}</td>
                  <td>
                    {q.revokedAt ? (
                      <span className="hanko hanko-mute">無効</span>
                    ) : q.expiresAt ? (
                      dead ? (
                        <span className="hanko hanko-mute">期限切れ</span>
                      ) : (
                        <span className="hanko hanko-shu">{fmtDateTime(q.expiresAt).slice(0, 10)}まで</span>
                      )
                    ) : (
                      <span className="hanko hanko-take">有効</span>
                    )}
                  </td>
                  <td className="row-actions">
                    {!dead && (
                      <>
                        <a className="btn btn-sm" href={`/print/qr/${q.id}`} target="_blank" rel="noopener">
                          A4ポスター
                        </a>
                        <a className="btn btn-sm" href={`/print/qr/${q.id}?size=pop`} target="_blank" rel="noopener">
                          卓上POP
                        </a>
                      </>
                    )}
                  </td>
                  <td className="row-actions">
                    {canWrite && !dead && !q.expiresAt && op(q, "rotate", "再発行", "新しいQRコードを発行し、このQRは猶予期間の後に無効になります。よろしいですか？")}
                    {canWrite && !q.revokedAt && op(q, "revoke", "無効にする", "このQRコードをすぐに使えなくします。よろしいですか？", "btn btn-sm btn-danger")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <div className="row-actions">
        {canWrite && (
          <ActionForm action={qrOpAction} resetOnOk>
            <input type="hidden" name="facilityId" value={facility.id} />
            <input type="hidden" name="op" value="issue" />
            <div className="filters">
              <label className="field">
                <span>設置場所</span>
                <input name="label" placeholder="2F フロント" />
              </label>
              <SubmitButton className="btn btn-sm">QRコードを追加発行</SubmitButton>
            </div>
          </ActionForm>
        )}
        <a className="btn btn-sm" href={`/print/staff-guide/${facility.id}`} target="_blank" rel="noopener">
          スタッフ向け確認ガイド
        </a>
      </div>
    </>
  );
}
