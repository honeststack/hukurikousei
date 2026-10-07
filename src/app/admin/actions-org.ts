"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import type { ActionState } from "@/components/action-form";
import { memberFormData } from "@/components/member-fields";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { revokeAllSessions, sendStaffInvite } from "@/lib/auth";
import { createImportPreview } from "@/lib/import-actions";
import { addAdjustment, rolloverMemberById } from "@/lib/ledger";
import { afterMemberSaved, applyImportAndInvite, inviteMembers } from "@/lib/member-ops";
import { createMember, updateMember } from "@/lib/members";
import { isValidYmd } from "@/lib/time";
import { act, ADMIN_ONLY, bool, int, str, uuidOk, WRITE } from "./_ctx";

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ───────── 導入企業・契約 ───────── */

export async function saveCompanyAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "id");
    const v = {
      name: str(fd, "name"),
      contactName: str(fd, "contactName"),
      contactEmail: str(fd, "contactEmail"),
      billingAddress: str(fd, "billingAddress"),
      note: str(fd, "note"),
    };
    if (!v.name) return { error: "企業名を入力してください" };
    if (id) {
      await db.update(schema.companies).set(v).where(eq(schema.companies.id, id));
      await audit(actor, "company.update", "company", id, v, db);
      revalidatePath(`/admin/companies/${id}`);
      return { ok: "保存しました" };
    }
    const [c] = await db.insert(schema.companies).values(v).returning();
    await audit(actor, "company.create", "company", c.id, v, db);
    redirect(`/admin/companies/${c.id}?ok=created`);
  });
}

export async function addContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const companyId = str(fd, "companyId");
    const startsOn = str(fd, "startsOn");
    const endsOn = str(fd, "endsOn") || null;
    if (!isValidYmd(startsOn) || (endsOn && !isValidYmd(endsOn))) return { error: "契約期間を正しく入力してください" };
    if (endsOn && endsOn < startsOn) return { error: "終了日は開始日以降にしてください" };
    const v = {
      companyId,
      startsOn,
      endsOn,
      monthlyPoints: int(fd, "monthlyPoints"),
      carryover: (str(fd, "carryover") === "cap" ? "cap" : "none") as "cap" | "none",
      carryoverCap: int(fd, "carryoverCap"),
      midMonthGrant: (str(fd, "midMonthGrant") === "next" ? "next" : "full") as "next" | "full",
      facilityScope: (str(fd, "facilityScope") === "selected" ? "selected" : "all") as "selected" | "all",
      billingBasis: (str(fd, "billingBasis") === "usage" ? "usage" : "per_member") as "usage" | "per_member",
      feePerMember: int(fd, "feePerMember"),
      showIndividualUsage: bool(fd, "showIndividualUsage"),
    };
    if (v.monthlyPoints < 0 || v.carryoverCap < 0 || v.feePerMember < 0) return { error: "金額・ポイントは0以上で入力してください" };
    const facilities = fd.getAll("facilities").map(String).filter(uuidOk);
    if (v.facilityScope === "selected" && !facilities.length) return { error: "対象施設を1つ以上選んでください" };
    await db.transaction(async (tx) => {
      const [c] = await tx.insert(schema.contracts).values(v).returning();
      if (v.facilityScope === "selected") {
        await tx.insert(schema.contractFacilities).values(facilities.map((facilityId) => ({ contractId: c.id, facilityId })));
      }
      await audit(actor, "contract.create", "company", companyId, { ...v, facilities }, tx);
    });
    redirect(`/admin/companies/${companyId}?ok=contract`);
  });
}

export async function endContractAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "contractId");
    const endsOn = str(fd, "endsOn");
    if (!isValidYmd(endsOn)) return { error: "終了日を入力してください" };
    const [c] = await db.select().from(schema.contracts).where(eq(schema.contracts.id, id));
    if (!c) return { error: "契約が見つかりません" };
    if (endsOn < c.startsOn) return { error: "終了日は開始日以降にしてください" };
    await db.update(schema.contracts).set({ endsOn }).where(eq(schema.contracts.id, id));
    await audit(actor, "contract.end", "company", c.companyId, { contractId: id, endsOn }, db);
    revalidatePath(`/admin/companies/${c.companyId}`);
    return flash("契約の終了日を設定しました");
  });
}

/* ───────── 施設の運営会社 ───────── */

export async function saveOperatorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "id");
    const v = { name: str(fd, "name"), contactEmail: str(fd, "contactEmail"), bankInfo: str(fd, "bankInfo"), invoiceNo: str(fd, "invoiceNo") };
    if (!v.name) return { error: "会社名を入力してください" };
    if (v.invoiceNo && !/^T\d{13}$/.test(v.invoiceNo)) return { error: "登録番号は T＋13桁 で入力してください" };
    if (id) {
      await db.update(schema.operators).set(v).where(eq(schema.operators.id, id));
      await audit(actor, "operator.update", "operator", id, v, db);
      revalidatePath("/admin/operators");
      return { ok: "保存しました" };
    }
    const [o] = await db.insert(schema.operators).values(v).returning();
    await audit(actor, "operator.create", "operator", o.id, v, db);
    revalidatePath("/admin/operators");
    return { ok: `「${o.name}」を登録しました` };
  });
}

/* ───────── 担当者アカウント ───────── */

export async function createStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(ADMIN_ONLY, async ({ actor, db }) => {
    const role = str(fd, "role") as (typeof schema.staffUsers.$inferInsert)["role"];
    if (!["admin", "operator", "viewer", "company", "facility"].includes(role)) return { error: "権限を選んでください" };
    const email = str(fd, "email").toLowerCase();
    const name = str(fd, "name");
    if (!name || !emailRe.test(email)) return { error: "氏名とメールアドレスを正しく入力してください" };
    const companyId = role === "company" ? str(fd, "companyId") : null;
    const operatorId = role === "facility" ? str(fd, "operatorId") : null;
    const facilityId = role === "facility" ? str(fd, "facilityId") || null : null;
    if (role === "company" && !uuidOk(companyId ?? "")) return { error: "企業を選んでください" };
    if (role === "facility" && !uuidOk(operatorId ?? "")) return { error: "運営会社を選んでください" };
    if (facilityId) {
      const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, facilityId));
      if (!f || f.operatorId !== operatorId) return { error: "店舗は選んだ運営会社のものにしてください" };
    }
    const [dup] = await db.select().from(schema.staffUsers).where(sql`lower(${schema.staffUsers.email}) = ${email}`);
    if (dup) return { error: "このメールアドレスはすでに登録されています" };
    const [created] = await db.insert(schema.staffUsers).values({ email, name, role, companyId, operatorId, facilityId }).returning();
    await audit(actor, "staff.create", "staff_user", created.id, { email, role }, db);
    await sendStaffInvite(created);
    revalidatePath("/admin/users");
    return { ok: `${name} さんを登録し、パスワード設定のメールを送りました` };
  });
}

export async function staffUserOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(ADMIN_ONLY, async ({ u, actor, db }) => {
    const id = str(fd, "userId");
    const op = str(fd, "op");
    const [t] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, id));
    if (!t) return { error: "アカウントが見つかりません" };
    if (t.id === u.id && (op === "deactivate" || op === "reset2fa")) return { error: "自分自身には実行できません" };
    if (op === "deactivate") {
      await db.update(schema.staffUsers).set({ active: false }).where(eq(schema.staffUsers.id, id));
      await revokeAllSessions("staff", id);
    } else if (op === "activate") {
      await db.update(schema.staffUsers).set({ active: true, failedLogins: 0, lockedUntil: null }).where(eq(schema.staffUsers.id, id));
    } else if (op === "reset2fa") {
      await db.update(schema.staffUsers).set({ totpEnabled: false, totpSecret: null }).where(eq(schema.staffUsers.id, id));
      await revokeAllSessions("staff", id);
    } else if (op === "invite") {
      await sendStaffInvite(t);
    } else return { error: "不明な操作です" };
    await audit(actor, `staff.${op}`, "staff_user", id, { email: t.email }, db);
    revalidatePath("/admin/users");
    return flash(`${t.name}：${{ deactivate: "利用を停止しました", activate: "利用を再開しました", reset2fa: "2段階認証を解除しました", invite: "パスワード設定のメールを送りました" }[op]}`);
  });
}

/* ───────── 会員 ───────── */

export async function adminAddMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const companyId = str(fd, "companyId");
    if (!uuidOk(companyId)) return { error: "企業を選んでください" };
    const r = await createMember(db, companyId, memberFormData(fd), actor);
    if (!r.ok) return { error: r.message };
    await afterMemberSaved(r.member.id);
    const invited = bool(fd, "sendInvite") ? await inviteMembers([r.member.id], actor) : 0;
    revalidatePath("/admin/members");
    return { ok: `${r.member.name} さんを登録しました${invited ? "（ご案内メール送信済み）" : ""}` };
  });
}

export async function adminUpdateMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "memberId");
    const r = await updateMember(db, id, memberFormData(fd), actor);
    if (!r.ok) return { error: r.message };
    await afterMemberSaved(id);
    revalidatePath(`/admin/members/${id}`);
    return { ok: "保存しました" };
  });
}

export async function adminMemberOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "memberId");
    const op = str(fd, "op");
    const [m] = await db.select().from(schema.members).where(eq(schema.members.id, id));
    if (!m) return { error: "会員が見つかりません" };
    if (op === "invite") {
      const n = await inviteMembers([id], actor);
      return n ? { ok: "ご案内メールを送りました" } : { error: "設定済みまたは停止中の会員には送れません" };
    }
    if (op === "unlock") {
      await db.update(schema.members).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.members.id, id));
      await audit(actor, "member.unlock", "member", id, undefined, db);
      return flash("ログインのロックを解除しました");
    }
    if (op === "logout") {
      await revokeAllSessions("member", id);
      await audit(actor, "member.logout_all", "member", id, undefined, db);
      return flash("すべての端末からログアウトさせました");
    }
    if (op === "adjust") {
      const amount = int(fd, "amount");
      const note = str(fd, "note");
      if (!amount) return { error: "加算・減算するポイントを入力してください（減算はマイナス）" };
      if (!note) return { error: "理由を入力してください" };
      await db.transaction(async (tx) => {
        await rolloverMemberById(tx, id, new Date());
        await addAdjustment(tx, id, amount, note, actor.name, new Date());
        await audit(actor, "points.adjust", "member", id, { amount, note }, tx);
      });
      revalidatePath(`/admin/members/${id}`);
      return { ok: `${amount > 0 ? "+" : ""}${amount}pt を調整しました` };
    }
    return { error: "不明な操作です" };
  });
}

export async function adminUploadImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor }) => {
    const companyId = str(fd, "companyId");
    if (!uuidOk(companyId)) return { error: "企業を選んでください" };
    const r = await createImportPreview(fd, companyId, actor);
    if (!r.ok) return { error: r.message };
    redirect(`/admin/members/import?company=${companyId}&id=${r.id}`);
  });
}

export async function adminApplyImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const importId = str(fd, "importId");
    const [imp] = await db.select().from(schema.memberImports).where(eq(schema.memberImports.id, importId));
    if (!imp) return { error: "取り込みが見つかりません" };
    const r = await applyImportAndInvite(importId, imp.companyId, actor, bool(fd, "sendInvites"));
    if (!r.ok) return { error: r.message };
    redirect(`/admin/members?company=${imp.companyId}&ok=${encodeURIComponent(`CSVを反映しました（新規 ${r.created}名・案内メール ${r.invited}通）`)}`);
  });
}

export async function adminDiscardImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ db }) => {
    const importId = str(fd, "importId");
    const [imp] = await db.select().from(schema.memberImports).where(eq(schema.memberImports.id, importId));
    await db.update(schema.memberImports).set({ status: "discarded" }).where(and(eq(schema.memberImports.id, importId)));
    redirect(`/admin/members/import?company=${imp?.companyId ?? ""}`);
  });
}
