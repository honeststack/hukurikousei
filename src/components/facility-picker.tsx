import Link from "next/link";

/** 複数店舗を持つ施設担当向けの店舗切り替え */
export function FacilityPicker({
  facilities,
  current,
  basePath,
  extra = "",
}: {
  facilities: { id: string; name: string }[];
  current: string;
  basePath: string;
  extra?: string;
}) {
  if (facilities.length <= 1) return null;
  return (
    <nav className="tabs" aria-label="店舗">
      {facilities.map((f) => (
        <Link key={f.id} href={`${basePath}?f=${f.id}${extra}`} aria-current={f.id === current ? "page" : undefined}>
          {f.name}
        </Link>
      ))}
    </nav>
  );
}
