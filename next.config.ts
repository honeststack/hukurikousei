import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "nodemailer", "@netlify/blobs"],
  poweredByHeader: false,
  // 公開デモ（DEMO_MODE=true）の設定をサーバー側のコードに埋め込む。
  // Netlify ではビルド時の環境変数が実行時には渡らないため。
  env: {
    DEMO_MODE: process.env.DEMO_MODE ?? "",
    DEMO_BUILD_ID: process.env.DEMO_MODE === "true" ? process.env.BUILD_ID || process.env.COMMIT_REF || String(Date.now()) : "",
    // Netlify はビルド時にサイトのURLを URL に入れる
    URL: process.env.URL ?? "",
  },
  // 公開デモのデータベース（スナップショット）と組込みDB本体を、サーバーの関数に同梱する
  outputFileTracingIncludes: {
    "/**": ["./.demo/**", "./drizzle/**", "./node_modules/@electric-sql/pglite/dist/**"],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
