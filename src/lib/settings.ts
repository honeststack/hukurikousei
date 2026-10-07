import { eq } from "drizzle-orm";
import { getDb, schema, type Executor } from "@/db";

export type AppSettings = {
  /** 1ポイントあたりの円 */
  yenPerPoint: number;
  /** 入館確定後、会員が自分で取り消せる時間（分） */
  selfCancelMinutes: number;
  /** 施設からこの距離（m）以上離れた入館に「要確認」を付ける */
  geofenceMeters: number;
  /** 会員が同時にログインできる端末数 */
  maxMemberDevices: number;
  /** 再発行した旧QRの猶予日数 */
  qrGraceDays: number;
  supportName: string;
  supportPhone: string;
  supportEmail: string;
  supportHours: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  yenPerPoint: 1,
  selfCancelMinutes: 3,
  geofenceMeters: 1000,
  maxMemberDevices: 2,
  qrGraceDays: 14,
  supportName: "湯札 事務局",
  supportPhone: "03-0000-0000",
  supportEmail: "support@example.com",
  supportHours: "平日 10:00〜18:00",
};

export async function getSettings(ex?: Executor): Promise<AppSettings> {
  const db = ex ?? (await getDb());
  const rows = await db.select().from(schema.settings);
  const out = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  for (const r of rows) if (r.key in out) out[r.key] = r.value;
  return out as AppSettings;
}

export async function saveSettings(patch: Partial<AppSettings>, ex?: Executor) {
  const db = ex ?? (await getDb());
  for (const [key, value] of Object.entries(patch)) {
    const existing = await db.select().from(schema.settings).where(eq(schema.settings.key, key));
    if (existing.length) {
      await db.update(schema.settings).set({ value, updatedAt: new Date() }).where(eq(schema.settings.key, key));
    } else {
      await db.insert(schema.settings).values({ key, value });
    }
  }
}
