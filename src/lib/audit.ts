import { getDb, schema, type Executor } from "@/db";

export type Actor = { kind: "member" | "staff" | "system"; id: string; name: string; ip?: string };

export const SYSTEM_ACTOR: Actor = { kind: "system", id: "system", name: "システム" };

export async function audit(
  actor: Actor,
  action: string,
  targetType: string,
  targetId: string,
  detail?: unknown,
  ex?: Executor,
) {
  const db = ex ?? (await getDb());
  await db.insert(schema.auditLogs).values({
    actorKind: actor.kind,
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetType,
    targetId,
    detail: detail === undefined ? null : (JSON.parse(JSON.stringify(detail)) as object),
    ip: actor.ip ?? "",
  });
}
