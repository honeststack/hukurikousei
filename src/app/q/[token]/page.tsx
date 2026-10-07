import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { getCurrentMember } from "@/lib/auth";
import { quoteCheckin, resolveQr } from "@/lib/checkin";
import { ensureRollover } from "@/lib/member-view";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/time";
import { MemberChrome } from "@/components/member-chrome";
import { CoursePicker } from "./course-picker";

export const metadata = { title: "コースを選ぶ" };

export default async function QrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const member = await getCurrentMember();
  if (!member) redirect(`/login?next=${encodeURIComponent(`/q/${token}`)}`);
  const now = new Date();
  await ensureRollover(member.id, now);
  const db = await getDb();
  const qr = await resolveQr(db, token, now);
  const settings = await getSettings(db);

  if (!qr.ok) {
    return (
      <MemberChrome>
        <h1 className="m-h1">QRコードを確認できません</h1>
        <p className="notice notice-error">{qr.message}</p>
        <p>
          <Link href="/m/scan" className="btn btn-primary btn-block">
            もう一度読み取る
          </Link>
        </p>
      </MemberChrome>
    );
  }

  const quote = await quoteCheckin(db, member, qr.facility, now);
  const f = qr.facility;

  return (
    <MemberChrome>
      <p className="small mute" style={{ margin: 0 }}>
        {f.area}
      </p>
      <h1 className="m-h1" style={{ marginBottom: 4 }}>
        {f.name}
      </h1>
      <p className="small" style={{ marginBottom: 16 }}>
        {fmtDate(quote.businessDate)}
        {quote.holidayName && <span className="tag tag-shu" style={{ marginLeft: 6 }}>{quote.holidayName}</span>}
        {quote.specialDayLabel && <span className="tag tag-shu" style={{ marginLeft: 6 }}>{quote.specialDayLabel}</span>}
      </p>

      {quote.existing ? (
        <>
          <p className="notice">本日はすでに入館済みです。入館は1日1回までです。</p>
          <Link href={`/m/pass/${quote.existing.id}`} className="btn btn-go btn-block btn-big">
            本日の入館証を表示
          </Link>
        </>
      ) : quote.blocked ? (
        <>
          <p className="notice notice-error" role="alert">
            {quote.blocked.message}
          </p>
          <p className="small">
            ご不明な点は {settings.supportName}（{settings.supportPhone}・{settings.supportHours}）までお問い合わせください。
          </p>
        </>
      ) : (
        <CoursePicker
          qrToken={token}
          balance={quote.balance}
          courses={quote.courses}
          surcharges={quote.surcharge.applied.map((a) => ({ label: a.label, amount: a.amount }))}
          stayNotices={quote.surcharge.notices.map((n) => ({ label: n.label, amount: n.amount, from: n.from }))}
          facilityName={f.name}
        />
      )}
    </MemberChrome>
  );
}
