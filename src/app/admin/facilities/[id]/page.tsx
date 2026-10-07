import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FacilityFields } from "@/components/facility-fields";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../../_ctx";
import { saveFacilityAction } from "../../actions-facility";
import { CalendarTab } from "./tab-calendar";
import { CoursesTab } from "./tab-courses";
import { QrTab } from "./tab-qr";
import { SurchargesTab } from "./tab-surcharges";
import { TermsTab } from "./tab-terms";

export const metadata = { title: "提携施設" };

const TABS = [
  ["basic", "基本情報"],
  ["courses", "コースと料金"],
  ["surcharges", "追加料金・試算"],
  ["terms", "精算条件"],
  ["qr", "QRコード"],
  ["calendar", "休館日・特別料金日"],
] as const;

type SP = { tab?: string; ok?: string; simDate?: string; simTime?: string };

export default async function FacilityAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const u = await requireStaff(READ);
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, id));
  if (!f) notFound();
  const tab = TABS.some(([k]) => k === sp.tab) ? sp.tab! : "basic";
  const canWrite = u.role !== "viewer";
  const operators = await db.select().from(schema.operators).orderBy(asc(schema.operators.name));

  return (
    <StaffShell user={u} title={f.name} crumbs={[{ href: "/admin/facilities", label: "提携施設" }]}>
      {sp.ok === "created" && <p className="notice notice-ok">施設を登録しました。コース・追加料金・精算条件を設定してください。</p>}
      {f.status === "suspended" && <p className="notice notice-error">この施設は停止中です。会員には表示されず、入館できません。</p>}
      <nav className="tabs" aria-label="設定">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/facilities/${f.id}?tab=${k}`} aria-current={tab === k ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      {tab === "basic" && (
        <section className="panel">
          <ActionForm action={saveFacilityAction}>
            <input type="hidden" name="id" value={f.id} />
            <FacilityFields f={f} operators={operators} />
            {canWrite && <SubmitButton>保存</SubmitButton>}
          </ActionForm>
        </section>
      )}
      {tab === "courses" && <CoursesTab facility={f} canWrite={canWrite} />}
      {tab === "surcharges" && <SurchargesTab facility={f} canWrite={canWrite} simDate={sp.simDate} simTime={sp.simTime} />}
      {tab === "terms" && <TermsTab facility={f} canWrite={canWrite} />}
      {tab === "qr" && <QrTab facility={f} canWrite={canWrite} />}
      {tab === "calendar" && <CalendarTab facility={f} canWrite={canWrite} />}
    </StaffShell>
  );
}
