import { requireMember } from "@/lib/auth";
import { noticesFor } from "@/lib/member-view";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "お知らせ" };

export default async function NoticesPage() {
  const member = await requireMember("/m/notices");
  const notices = await noticesFor(member);
  return (
    <>
      <h1 className="m-h1">お知らせ</h1>
      {notices.length === 0 ? (
        <p className="mute">お知らせはありません。</p>
      ) : (
        <ul className="list">
          {notices.map((n) => (
            <li key={n.id}>
              <div className="small mute">{fmtDateTime(n.publishedAt)}</div>
              <b>{n.title}</b>
              <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
