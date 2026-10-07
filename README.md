# 湯札（ゆふだ）— 温浴施設の福利厚生会員証システム

企業の従業員が、スマートフォンのブラウザで提携の温浴施設（スーパー銭湯・サウナ）を毎月のポイントで利用するためのシステムです。
要件は [requirements.md](requirements.md)（要件定義書）にまとめています。

| 画面 | 利用者 | URL |
| --- | --- | --- |
| 会員証・入館 | 導入企業の従業員（スマートフォン） | `/login` → `/m` |
| 運営管理 | 運営事務局 | `/staff/login` → `/admin` |
| 導入企業 | 人事・総務の担当者 | `/staff/login` → `/company` |
| 提携施設 | 施設の運営会社・店舗 | `/staff/login` → `/facility` |

## すぐに動かす（ローカル）

Node.js 20.9 以上が必要です。データベースのインストールは不要です（組込みの PostgreSQL「PGlite」を `.data/pglite` に作ります）。

```bash
npm install
cp .env.example .env          # Windows は copy .env.example .env
npm run db:reset              # データベースを作り、デモデータを入れる
npm run dev                   # http://localhost:3000
```

デモのログイン（パスワードはすべて `yufuda2026`）

| 立場 | ログイン画面 | メールアドレス |
| --- | --- | --- |
| 会員 | `/login` | `demo@example.com` |
| 運営管理者 | `/staff/login` | `admin@example.com` |
| 運営担当（精算確定・設定は不可） | `/staff/login` | `ops@example.com` |
| 導入企業 | `/staff/login` | `hr@sample-shoji.example` |
| 提携施設（2店舗） | `/staff/login` | `front@yukemuri.example` |

施設のQRコードは、会員でログインした状態で次のURLを開くと読み取ったのと同じ動きになります。

- `http://localhost:3000/q/demo-minato-front`（天然温泉 みなと湯）
- `http://localhost:3000/q/demo-mori-front`（サウナと岩盤浴 森の湯）
- `http://localhost:3000/q/demo-matsu-bandai`（銭湯 松乃湯・月曜定休）

メールはSMTPを設定するまで送信されず、運営画面の「メール送信記録」で本文（招待リンクなど）を確認できます。

> 組込みDBは1つのプロセスからしか開けません。`npm run db:reset` などのスクリプトは、開発サーバーを止めてから実行してください。

## 主な仕組み

- **入館**：施設に貼ったQRコード（施設を表すURL）を読み取る → コースを選ぶ → 「スライドして入館」。入館の成立とポイント消費はサーバーの1つのトランザクションで確定します。QRだけでは何も消費されません。
- **会員証・入館証**：サーバー時刻に合わせて秒まで動く時計と、日替わりの色・印（サーバーの秘密鍵と日付から決まり、毎日変わる）を表示します。スクリーンショットは色と止まった時計で見分けられます。
- **1日1回**：施設ごとの「営業日の切替時刻」（例：朝5時）で営業日を決め、`会員 × 営業日` の一意制約で二重入館をデータベースが拒否します。二重タップや通信の再送は確定ボタンごとの冪等キーで1回だけ記録します。
- **ポイント**：残高を上書きせず、付与・利用・取消戻し・失効・調整をすべて追記する台帳で管理します（DBトリガーで更新・削除を禁止）。毎月1日の切替（失効→付与）は会員ごとに冪等で、定期処理が止まっていても会員が画面を開いた時点で正しく処理されます。
- **不足時**：残高を全て使い、足りない分を円に換算して「受付でお支払い」と表示します。追加料金（土日祝・深夜など）は常に店頭払いです。
- **料金と精算**：コース料金・追加料金ルール・精算条件はすべて「適用開始日」付きで管理画面から変更できます。入館記録にはその時点の値を写し取るため、後から変えても過去の精算額は変わりません。
- **精算の締め**：仮集計 → 施設に確認依頼 → 施設が確認 → 運営管理者が確定（ロック）。確定後の取消は、取消した月の精算にマイナスの調整行として計上し、確定帳票は書き換えません。
- **不正の検知**：施設から遠い入館（位置情報を許可した会員のみ）、同じ端末での別会員の入館、短時間に別施設での入館、精算条件の未設定に自動で印を付け、運営画面「要確認の入館」に一覧表示します。
- **プライバシー**：導入企業の画面は集計値のみ（1〜2名の部署は幅で表示）。個人別の利用回数は、契約で開示を合意した企業だけに表示します。

## 定期処理（毎日）

失効→付与・停止者の残高無効化・精算の仮集計を行います。何度実行しても結果は同じです。

```bash
npm run job:monthly
# または外部スケジューラから
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/monthly
```

運営画面の「定期処理」から手動で実行することもできます。

## 本番環境

PostgreSQL（14以上）を用意し、環境変数を設定します（[.env.example](.env.example)）。

| 変数 | 内容 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL の接続文字列（設定すると組込みDBは使いません） |
| `APP_SECRET` | セッション・日替わり色の署名用。32文字以上のランダム値 |
| `APP_URL` | 公開URL（招待メールと施設QRに入ります）。QR発行後は変更しないでください |
| `CRON_SECRET` | 定期処理APIの認証トークン |
| `SMTP_URL` / `MAIL_FROM` | メール送信（例：`smtp://user:pass@smtp.example.com:587`） |
| `REQUIRE_ADMIN_2FA` | `true` で運営アカウントに2段階認証を必須にする（推奨） |

```bash
npm ci
npm run build
npm run db:migrate                                   # マイグレーション適用
npm run admin:create -- you@example.com "運営 太郎"   # 最初の運営管理者（設定URLが表示されます）
npm run start
```

Docker を使う場合は [docker-compose.yml](docker-compose.yml) に、アプリ・PostgreSQL・定期処理（1時間ごと）の構成例があります。

```bash
DB_PASSWORD=... APP_SECRET=... APP_URL=https://your-domain CRON_SECRET=... docker compose up -d --build
docker compose exec app npm run admin:create -- you@example.com "運営 太郎"
```

HTTPS は前段のリバースプロキシ（nginx、ロードバランサーなど）で終端してください。カメラの起動と位置情報の取得には HTTPS が必要です。

### 初期設定の順番

1. 運営画面「設定」：換算率（1pt＝何円）、問い合わせ先
2. 「施設の運営会社」→「提携施設」：コース・料金、追加料金（試算で確認）、精算条件、QR掲示物の印刷
3. 「祝日・特別料金日」：翌年の祝日（内閣府のCSV）、GW・年末年始など
4. 「導入企業」：契約（毎月の付与ポイント・繰越・請求の基準）、企業の担当者を招待
5. 企業の担当者が「CSV一括登録」で会員を登録 → 会員に案内メールが届く

## 開発

```bash
npm run typecheck     # 型チェック
npm test              # 料金・ポイント・精算・CSV取込の単体テストと一連の流れのテスト（メモリ上のDBで実行）
npm run test:e2e      # 画面の通しテスト（npm run db:reset → npm run dev の後に実行。Playwright の Chromium が必要）
```

| 場所 | 内容 |
| --- | --- |
| `src/db/schema.ts` | テーブル定義（Drizzle ORM）。変更したら `npm run db:generate` でマイグレーションを作成 |
| `src/lib/pricing.ts` | 追加料金・料金の版・精算額の計算（純粋関数） |
| `src/lib/checkin.ts` | QRの確認、見積、入館の確定、取消 |
| `src/lib/ledger.ts` | ポイント台帳と月次の切替 |
| `src/lib/statements.ts` | 月次精算（仮集計・確認・確定・調整行） |
| `src/app/(member)`・`src/app/q` | 会員画面 |
| `src/app/admin`・`company`・`facility` | 運営・導入企業・提携施設の画面 |
| `src/app/print` | 印刷物（QRポスター・卓上POP・スタッフ向けガイド・支払通知書・社内周知） |

技術構成：Next.js 16（App Router・TypeScript）、PostgreSQL（Drizzle ORM）、画面はフレームワークを使わない自前のCSS（[src/app/globals.css](src/app/globals.css)）。

### 差し替えが必要なもの

- 利用規約・個人情報の取り扱い（`/terms`・`/privacy`）はひな形です。運営者の文面に差し替えてください。
- 祝日の初期データは2026〜2027年分です。毎年、内閣府のCSVを取り込んでください。
