import { redirect } from "next/navigation";
import { getStaffSession, homeForRole } from "@/lib/auth";

export default async function StaffHome() {
  const s = await getStaffSession();
  if (!s) redirect("/staff/login");
  if (s.session.mfaPending) redirect("/staff/mfa");
  redirect(homeForRole(s.user.role));
}
