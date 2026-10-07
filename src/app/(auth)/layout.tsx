import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-head">
        <Link href="/" className="auth-logo" aria-label="湯札 トップ" style={{ textDecoration: "none" }}>
          湯札
        </Link>
      </div>
      {children}
    </div>
  );
}
