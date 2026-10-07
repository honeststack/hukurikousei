"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.4, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS = {
  card: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" {...stroke} />
      <circle cx="12" cy="6" r="1" {...stroke} />
      <path d="M9.5 15.5h5M9.5 18h3" {...stroke} />
    </svg>
  ),
  place: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20.5h16M6 20.5V11l6-4.5 6 4.5v9.5" {...stroke} />
      <path d="M10 20.5v-5h4v5M9.5 4.5c.8-1 .8-2 0-3M14.5 4.5c.8-1 .8-2 0-3" {...stroke} />
    </svg>
  ),
  book: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v16H6.5A1.5 1.5 0 0 0 5 20.5z" {...stroke} />
      <path d="M5 20.5A1.5 1.5 0 0 0 6.5 22H19" {...stroke} />
      <circle cx="12" cy="10.5" r="3" {...stroke} />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h10" {...stroke} />
    </svg>
  ),
};

const TABS = [
  {
    href: "/m",
    label: "会員証",
    ic: ICONS.card,
    match: (p: string) => p === "/m" || p.startsWith("/m/pass") || p.startsWith("/m/scan") || p.startsWith("/q/"),
  },
  { href: "/m/facilities", label: "施設", ic: ICONS.place, match: (p: string) => p.startsWith("/m/facilities") },
  { href: "/m/history", label: "記録", ic: ICONS.book, match: (p: string) => p.startsWith("/m/history") },
  {
    href: "/m/account",
    label: "その他",
    ic: ICONS.more,
    match: (p: string) => ["/m/account", "/m/guide", "/m/notices"].some((x) => p.startsWith(x)),
  },
];

export function MemberTabs() {
  const path = usePathname();
  return (
    <nav className="m-tabs" aria-label="メニュー">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}>
          <span className="tab-ic">{t.ic}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
