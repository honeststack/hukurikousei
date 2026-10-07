import { requireMember } from "@/lib/auth";
import { MemberChrome } from "@/components/member-chrome";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return <MemberChrome>{children}</MemberChrome>;
}
