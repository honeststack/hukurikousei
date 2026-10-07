import Link from "next/link";
import { Scanner } from "./scanner";

export const metadata = { title: "QRを読み取る" };

export default function ScanPage() {
  return (
    <>
      <h1 className="m-h1">QRを読み取る</h1>
      <Scanner />
      <div className="card small" style={{ marginTop: 16 }}>
        <b>読み取れないときは</b>
        <ul style={{ margin: "4px 0 0", paddingLeft: "1.2em" }}>
          <li>QRコードに近づきすぎず、20〜30cmほど離してください</li>
          <li>iPhone・Androidのカメラアプリで読み取っても、同じ画面が開きます</li>
          <li>それでも開けないときは、受付でお申し出ください</li>
        </ul>
      </div>
      <p style={{ marginTop: 16 }}>
        <Link href="/m">会員証に戻る</Link>
      </p>
    </>
  );
}
