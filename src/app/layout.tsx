import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Shippori_Mincho, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

const sans = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-sans", display: "swap", preload: false });
const mincho = Shippori_Mincho({ weight: ["500", "600", "700"], subsets: ["latin"], variable: "--font-shippori", display: "swap", preload: false });
const serif = Cormorant_Garamond({ weight: ["500", "600"], subsets: ["latin"], variable: "--font-serif", display: "swap" });
const latin = Jost({ weight: ["300", "400", "500"], subsets: ["latin"], variable: "--font-latin", display: "swap" });

export const metadata: Metadata = {
  title: { default: "湯札", template: "%s｜湯札" },
  description: "提携の温浴施設を毎月のポイントで利用できる、福利厚生の会員証",
  applicationName: "湯札",
  appleWebApp: { capable: true, title: "湯札", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#f6f3ee",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// 全ページが会員・担当者ごとの内容のため、静的生成しない
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={`${sans.variable} ${mincho.variable} ${serif.variable} ${latin.variable}`}>
      <body>{children}</body>
    </html>
  );
}
