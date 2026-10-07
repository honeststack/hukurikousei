import Link from "next/link";

export const metadata = { title: "使い方" };

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const { first } = await searchParams;
  return (
    <>
      {first && <p className="notice notice-ok">会員証ができました。使い方を3つだけご案内します。</p>}
      <h1 className="m-h1">使い方</h1>

      <div className="guide-step">
        <div className="guide-num">一</div>
        <div>
          <b>受付のQRコードを読み取る</b>
          <p className="small" style={{ margin: "4px 0 0" }}>
            会員証の「受付のQRを読み取って入館」を押すか、スマートフォンのカメラアプリで読み取ります。
          </p>
        </div>
      </div>
      <div className="guide-step">
        <div className="guide-num">二</div>
        <div>
          <b>コースを選んで、スライドして入館</b>
          <p className="small" style={{ margin: "4px 0 0" }}>
            土日祝・深夜などの追加料金があるときは、選ぶ前に赤い札でお知らせします。ポイントが足りないときは、差額を受付でお支払いください。
          </p>
        </div>
      </div>
      <div className="guide-step">
        <div className="guide-num">三</div>
        <div>
          <b>入館証を受付に見せる</b>
          <p className="small" style={{ margin: "4px 0 0" }}>
            時計が秒まで動いている画面を見せてください。スクリーンショットは使えません。入館は1日1回までです。
          </p>
        </div>
      </div>

      <section className="m-section">
        <h2>ホーム画面に追加すると、すぐ開けます</h2>
        <details className="fold">
          <summary>iPhone（Safari）の場合</summary>
          <div>
            <ol className="small" style={{ paddingLeft: "1.3em", margin: 0 }}>
              <li>画面下の共有ボタン（四角から矢印が出ているマーク）を押す</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>右上の「追加」を押す</li>
            </ol>
          </div>
        </details>
        <details className="fold">
          <summary>Android（Chrome）の場合</summary>
          <div>
            <ol className="small" style={{ paddingLeft: "1.3em", margin: 0 }}>
              <li>画面右上の「︙」を押す</li>
              <li>「ホーム画面に追加」を選ぶ</li>
              <li>「追加」を押す</li>
            </ol>
          </div>
        </details>
      </section>

      <section className="m-section">
        <h2>ポイントについて</h2>
        <ul className="small" style={{ paddingLeft: "1.2em", margin: 0 }}>
          <li>毎月1日に、会社が決めたポイントが付与されます。</li>
          <li>使い切れなかったポイントは月末に失効します（会社のご契約により繰越できる場合があります）。</li>
          <li>追加料金はポイントでは払えません。受付でお支払いください。</li>
        </ul>
      </section>

      <p style={{ marginTop: 24 }}>
        <Link href="/m" className="btn btn-primary btn-block btn-big">
          会員証を表示する
        </Link>
      </p>
    </>
  );
}
