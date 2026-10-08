/**
 * デモモード：外部のデータベースなしで動かす（Netlify などでの公開デモ用）。
 *
 * - ビルド時に作った「デモデータ入りのデータベース」（.demo/snapshot.tar.gz）をメモリ上に読み込む
 * - サーバーが複数起動しても同じデータになるよう、変更後の状態を Netlify Blobs に保存し、
 *   他のサーバーは次のリクエストの前に最新の状態を読み直す
 * - 新しくデプロイするたびに、デモデータは初期状態に戻る
 */
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { DB } from "./index";
import * as schema from "./schema";

type Store = import("@netlify/blobs").Store;
type SharedState = { version: number; pending: boolean; pendingAt: number; updatedAt: number };

const BUILD = process.env.DEMO_BUILD_ID || "local";
const STATE_KEY = `${BUILD}/state`;
const DB_KEY = `${BUILD}/db`;
/** 1リクエスト内の問い合わせ間隔より長い空き時間があれば「次のリクエスト」とみなす */
const IDLE_GAP_MS = 400;
/** 他のサーバーの保存待ちの上限 */
const PENDING_WAIT_MS = 4000;
const PENDING_STALE_MS = 15000;
/** 最後の変更からこれ以上経ったら初期状態に戻す */
const RESET_AFTER_MS = 24 * 60 * 60 * 1000;

const debug = (...a: unknown[]) => {
  if (process.env.DEMO_DEBUG) console.log("[demo]", new Date().toISOString().slice(17, 23), ...a);
};

const WRITE_SQL = /^\s*(insert|update|delete|create|alter|drop|truncate)\b/i;

function snapshotPath(): string | null {
  const candidates = [
    path.join(process.cwd(), ".demo", "snapshot.tar.gz"),
    process.env.LAMBDA_TASK_ROOT ? path.join(process.env.LAMBDA_TASK_ROOT, ".demo", "snapshot.tar.gz") : "",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

async function openStore(): Promise<Store | null> {
  if (!process.env.NETLIFY_BLOBS_CONTEXT && !process.env.NETLIFY_BLOBS_API_URL) return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    // Next.js は1回の画面処理の中で同じURLへの fetch の結果を使い回すため、
    // 毎回別の signal を付けて、Blobs への問い合わせが必ず最新を取りに行くようにする
    const fresh: typeof fetch = (input, init) =>
      fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? new AbortController().signal });
    return getStore({ name: "yufuda-demo", consistency: "strong", fetch: fresh } as Parameters<typeof getStore>[0]);
  } catch (e) {
    console.warn("[demo] Netlify Blobs を使えないため、データはこのサーバーの中だけに保存します", e);
    return null;
  }
}

class DemoRuntime {
  private client!: PGlite;
  private drizzleDb!: DB;
  private version = 0;
  private dirty = false;
  private lastActivity = 0;
  private persisting: Promise<void> | null = null;
  private store: Store | null = null;
  readonly db: DB;

  constructor() {
    // 読み直しで中身が入れ替わっても、呼び出し側が持つ db はそのまま使えるようにする
    this.db = new Proxy({} as DB, {
      get: (_t, prop) => {
        const v = (this.drizzleDb as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(this.drizzleDb) : v;
      },
    });
  }

  async init() {
    this.store = await openStore();
    const shared = await this.readState();
    if (shared && this.store && Date.now() - shared.updatedAt < RESET_AFTER_MS) {
      const buf = await this.store.get(DB_KEY, { type: "arrayBuffer" }).catch(() => null);
      if (buf) {
        await this.open(new Blob([buf]));
        this.version = shared.version;
        return;
      }
    }
    await this.openFresh();
  }

  /** リクエストの初めに呼ぶ。他のサーバーの変更があれば読み直す。 */
  async sync() {
    if (!this.store) return;
    if (Date.now() - this.lastActivity < IDLE_GAP_MS) return;
    this.lastActivity = Date.now();
    if (this.persisting) await this.persisting;
    if (this.dirty) await this.persist();
    let shared = await this.readState();
    debug("sync", JSON.stringify({ mine: this.version, shared }));
    const started = Date.now();
    while (shared?.pending && Date.now() - shared.pendingAt < PENDING_STALE_MS && Date.now() - started < PENDING_WAIT_MS) {
      await new Promise((r) => setTimeout(r, 200));
      shared = await this.readState();
      debug("waited", JSON.stringify(shared));
    }
    if (!shared) return;
    if (Date.now() - shared.updatedAt >= RESET_AFTER_MS) {
      await this.close();
      await this.openFresh();
      this.markDirty();
      await this.persist();
      return;
    }
    if (shared.version !== this.version) {
      const buf = await this.store.get(DB_KEY, { type: "arrayBuffer" }).catch(() => null);
      if (!buf) return;
      await this.close();
      await this.open(new Blob([buf]));
      this.version = shared.version;
      debug("reloaded", shared.version);
    }
    this.lastActivity = Date.now();
  }

  private async readState(): Promise<SharedState | null> {
    if (!this.store) return null;
    return ((await this.store.get(STATE_KEY, { type: "json" }).catch(() => null)) as SharedState | null) ?? null;
  }

  private async openFresh() {
    const snap = snapshotPath();
    if (snap) {
      await this.open(new Blob([fs.readFileSync(snap)]));
      return;
    }
    // スナップショットがない場合（ローカルで直接起動した場合など）はその場で作る
    await this.open();
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(this.drizzleDb as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    const { seed } = await import("./seed");
    await seed(this.db);
  }

  private async open(data?: Blob) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = data ? new PGlite({ loadDataDir: data }) : new PGlite();
    await client.waitReady;
    this.instrument(client);
    this.client = client;
    this.drizzleDb = drizzle(client, { schema }) as unknown as DB;
  }

  private async close() {
    try {
      await this.client?.close();
    } catch {
      /* 既に閉じている */
    }
  }

  /** 書き込みを検知して、保存の予約をする */
  private instrument(client: PGlite) {
    const note = async (sql: unknown) => {
      this.lastActivity = Date.now();
      if (typeof sql === "string" && WRITE_SQL.test(sql)) await this.onWrite();
    };
    const query = client.query.bind(client);
    const exec = client.exec.bind(client);
    const transaction = client.transaction.bind(client);
    (client as unknown as { query: unknown }).query = async (sql: string, ...rest: unknown[]) => {
      await note(sql);
      return (query as (...a: unknown[]) => unknown)(sql, ...rest);
    };
    (client as unknown as { exec: unknown }).exec = async (sql: string, ...rest: unknown[]) => {
      await note(sql);
      return (exec as (...a: unknown[]) => unknown)(sql, ...rest);
    };
    (client as unknown as { transaction: unknown }).transaction = (fn: (tx: unknown) => Promise<unknown>) =>
      transaction(async (tx) => {
        const q = tx.query.bind(tx);
        const e = tx.exec.bind(tx);
        (tx as unknown as { query: unknown }).query = async (sql: string, ...rest: unknown[]) => {
          await note(sql);
          return (q as (...a: unknown[]) => unknown)(sql, ...rest);
        };
        (tx as unknown as { exec: unknown }).exec = async (sql: string, ...rest: unknown[]) => {
          await note(sql);
          return (e as (...a: unknown[]) => unknown)(sql, ...rest);
        };
        return fn(tx);
      });
  }

  private markDirty() {
    this.dirty = true;
  }

  private pendingMarked = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** 書き込みのたびに呼ぶ。最初の書き込みで他のサーバーに知らせ、保存を予約する。 */
  private async onWrite() {
    if (!this.dirty) debug("first write");
    this.markDirty();
    if (!this.store) return;
    if (!this.pendingMarked) {
      this.pendingMarked = true;
      // 他のサーバーに「保存中なので少し待って」と知らせる
      const shared = await this.readState();
      await this.store
        .setJSON(STATE_KEY, { ...(shared ?? { version: this.version, updatedAt: Date.now() }), pending: true, pendingAt: Date.now() })
        .catch(() => undefined);
      // 応答を返した後に保存する（Netlify では応答後も処理を続けられる）
      try {
        const { after } = await import("next/server");
        after(() => this.persistWhenQuiet());
      } catch {
        /* リクエストの外（スクリプトなど） */
      }
    }
    // 予備：書き込みが落ち着いたら保存する
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.persistWhenQuiet(), 600);
  }

  /** 書き込みが一段落する（問い合わせが少し途切れる）のを待ってから保存する */
  private async persistWhenQuiet() {
    while (Date.now() - this.lastActivity < 150) await new Promise((r) => setTimeout(r, 50));
    await this.persist();
  }

  async persist(): Promise<void> {
    if (!this.store || !this.dirty) return;
    if (this.persisting) {
      await this.persisting;
      return this.persist();
    }
    this.persisting = (async () => {
      try {
        // 保存中に新しい書き込みがあれば、もう一度保存する
        while (this.dirty) {
          this.dirty = false;
          const dump = await this.client.dumpDataDir("gzip");
          const buf = await dump.arrayBuffer();
          const version = Date.now();
          await this.store!.set(DB_KEY, buf);
          this.version = version;
          debug("persisted", version, buf.byteLength);
          await this.store!.setJSON(STATE_KEY, {
            version,
            pending: this.dirty,
            pendingAt: this.dirty ? Date.now() : 0,
            updatedAt: Date.now(),
          } satisfies SharedState);
        }
        this.pendingMarked = false;
      } catch (e) {
        console.error("[demo] 状態の保存に失敗しました", e);
        this.dirty = true;
      } finally {
        this.persisting = null;
      }
    })();
    return this.persisting;
  }
}

const g = globalThis as unknown as { __yufudaDemo?: Promise<DemoRuntime> };

export async function getDemoDb(): Promise<DB> {
  if (!g.__yufudaDemo) {
    g.__yufudaDemo = (async () => {
      const rt = new DemoRuntime();
      await rt.init();
      return rt;
    })();
    g.__yufudaDemo.catch(() => {
      g.__yufudaDemo = undefined;
    });
  }
  const rt = await g.__yufudaDemo;
  await rt.sync();
  return rt.db;
}

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true" && !process.env.DATABASE_URL && !process.env.NETLIFY_DATABASE_URL;
}
