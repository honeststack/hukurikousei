import Link from "next/link";

export const metadata = { title: "個人情報の取り扱い" };

/** 方針本文は運営者が法務確認のうえ差し替える前提のひな形 */
export default function PrivacyPage() {
  return (
    <div className="auth" style={{ maxWidth: 680, paddingTop: 32 }}>
      <h1 className="auth-title">個人情報の取り扱い</h1>
      <p className="notice small">この本文はひな形です。サービス開始前に、運営者の個人情報保護方針に差し替えてください。</p>
      <h2 style={{ fontSize: "1.05rem" }}>取得する情報</h2>
      <ul>
        <li>導入企業から提供される氏名・フリガナ・社員番号・メールアドレス・部署・利用期間</li>
        <li>入館の記録（日時・施設・コース・ポイント）</li>
        <li>不正防止のための端末の識別子、通信元、入館時点の位置情報（位置情報は許可された場合のみ）</li>
      </ul>
      <h2 style={{ fontSize: "1.05rem" }}>利用目的</h2>
      <ul>
        <li>会員証の表示、入館の受付、ポイントの管理</li>
        <li>提携施設への精算、導入企業への請求と利用状況の報告</li>
        <li>不正な利用の防止と調査</li>
      </ul>
      <h2 style={{ fontSize: "1.05rem" }}>導入企業への提供</h2>
      <p>
        導入企業には、原則として利用人数・回数などの集計値のみを提供します。個人ごとの利用記録は、導入企業との契約で合意した場合に限り提供します。
      </p>
      <h2 style={{ fontSize: "1.05rem" }}>保存期間</h2>
      <p>入館と精算の記録は、税務上の保存期間に合わせて7年間保存します。位置情報は入館の確認に必要な期間に限り保存します。</p>
      <p style={{ marginTop: 24 }}>
        <Link href="/m">戻る</Link>
      </p>
    </div>
  );
}
