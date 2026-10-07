"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; badge?: number; exact?: boolean };
export type NavGroup = { title?: string; items: NavItem[] };

export function SideNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const all = groups.flatMap((g) => g.items);
  // 最も長く一致する項目だけを現在地にする（/admin と /admin/members の両方を光らせない）
  const current = all
    .filter((i) => (i.exact ? path === i.href : path === i.href || path.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <nav className="s-nav" aria-label="メニュー">
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: "contents" }}>
          {g.title && <div className="s-nav-group">{g.title}</div>}
          {g.items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={current?.href === i.href ? "page" : undefined}>
              <span>{i.label}</span>
              {!!i.badge && <span className="s-badge">{i.badge}</span>}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
