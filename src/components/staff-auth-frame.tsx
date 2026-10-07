export function StaffAuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-head">
        <span className="auth-logo">湯札</span>
        <h1 className="auth-title">{title}</h1>
        <p className="small mute">導入企業・提携施設・運営のご担当者用</p>
      </div>
      {children}
    </div>
  );
}
