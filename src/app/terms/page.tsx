import Link from "next/link";

export const metadata = { title: "利用規約" };

/** 規約本文は運営者が法務確認のうえ差し替える前提のひな形 */
export default function TermsPage() {
  return (
    <div className="auth" style={{ maxWidth: 680, paddingTop: 32 }}>
      <h1 className="auth-title">湯札 利用規約</h1>
      <p className="notice small">この本文はひな形です。サービス開始前に、運営者の規約に差し替えてください。</p>
      <h2 style={{ fontSize: "1.05rem" }}>第1条（適用）</h2>
      <p>本規約は、導入企業の従業員である会員が、提携温浴施設を本サービスのポイントで利用する際の条件を定めます。</p>
      <h2 style={{ fontSize: "1.05rem" }}>第2条（ポイント）</h2>
      <p>
        ポイントは導入企業との契約に基づき毎月1日に付与され、契約で定める期限を過ぎると失効します。ポイントは換金・譲渡できません。ポイントが不足する場合の差額、および施設の追加料金は、会員が施設で直接支払うものとします。
      </p>
      <h2 style={{ fontSize: "1.05rem" }}>第3条（入館）</h2>
      <p>入館は1日1回までとします。会員証および入館証を第三者に使用させてはなりません。不正な利用が確認された場合、利用を停止することがあります。</p>
      <h2 style={{ fontSize: "1.05rem" }}>第4条（施設の利用）</h2>
      <p>施設内では各施設の利用規則に従ってください。施設の設備・サービスに関するお問い合わせは各施設にお願いします。</p>
      <p style={{ marginTop: 24 }}>
        <Link href="/m">戻る</Link>
      </p>
    </div>
  );
}
