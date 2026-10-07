import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentMember, getCurrentStaff, homeForRole } from "@/lib/auth";

export default async function Home() {
  if (await getCurrentMember()) redirect("/m");
  const staff = await getCurrentStaff();
  if (staff) redirect(homeForRole(staff.role));
  return (
    <div className="auth" style={{ textAlign: "center" }}>
      <div className="auth-head">
        <span className="auth-logo">湯札</span>
        <h1 className="auth-title">温浴施設の福利厚生会員証</h1>
        <p className="small mute">提携のスーパー銭湯・サウナを、毎月のポイントでご利用いただけます。</p>
      </div>
      <Link href="/login" className="btn btn-primary btn-block btn-big">
        会員証を開く
      </Link>
      <p className="small" style={{ marginTop: 32 }}>
        <Link href="/staff/login">企業・施設・運営のご担当者はこちら</Link>
      </p>
    </div>
  );
}
