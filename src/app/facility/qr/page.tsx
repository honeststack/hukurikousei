import { inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilitiesFor } from "@/lib/scope";
import { fmtDateTime } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "QR掲示物" };

export default async function FacilityQrPage() {
  const u = await requireStaff(["facility"]);
  const facilities = await facilitiesFor(u);
  const db = await getDb();
  const qrs = facilities.length
    ? await db.select().from(schema.facilityQrs).where(inArray(schema.facilityQrs.facilityId, facilities.map((f) => f.id)))
    : [];
  const now = new Date();
  return (
    <StaffShell user={u} title="QR掲示物">
      <p className="small">
        受付の見やすい場所に、A4ポスターまたは卓上POPを掲示してください。QRコードの発行・再発行は運営が行います。汚れや破損があれば運営にご連絡ください。
      </p>
      {facilities.map((f) => (
        <section className="panel" key={f.id}>
          <h2>
            {f.name}
            <a className="btn btn-sm" href={`/print/staff-guide/${f.id}`} target="_blank" rel="noopener">
              スタッフ向け確認ガイドを印刷
            </a>
          </h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>設置場所</th>
                <th>発行日</th>
                <th>状態</th>
                <th>印刷</th>
              </tr>
            </thead>
            <tbody>
              {qrs
                .filter((q) => q.facilityId === f.id)
                .map((q) => {
                  const dead = !!q.revokedAt || (!!q.expiresAt && q.expiresAt < now);
                  return (
                    <tr key={q.id} className={dead ? "is-off" : undefined}>
                      <td>{q.label || "受付"}</td>
                      <td>{fmtDateTime(q.issuedAt)}</td>
                      <td>
                        {dead ? (
                          <span className="hanko hanko-mute">無効</span>
                        ) : q.expiresAt ? (
                          <span className="hanko hanko-shu">{fmtDateTime(q.expiresAt).slice(0, 10)}まで</span>
                        ) : (
                          <span className="hanko hanko-take">有効</span>
                        )}
                      </td>
                      <td className="row-actions">
                        {!dead && (
                          <>
                            <a className="btn btn-sm btn-primary" href={`/print/qr/${q.id}`} target="_blank" rel="noopener">
                              A4ポスター
                            </a>
                            <a className="btn btn-sm" href={`/print/qr/${q.id}?size=pop`} target="_blank" rel="noopener">
                              卓上POP
                            </a>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </section>
      ))}
    </StaffShell>
  );
}
