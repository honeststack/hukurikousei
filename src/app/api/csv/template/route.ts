import { requireStaff } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { CSV_TEMPLATE_HEADER } from "@/lib/members";

export async function GET() {
  await requireStaff(["admin", "operator", "company"]);
  return csvResponse(
    "会員登録ひな形.csv",
    toCsv(CSV_TEMPLATE_HEADER, [["A0001", "山田 花子", "ヤマダ ハナコ", "hanako.yamada@example.com", "営業部", "2026/04/01", ""]]),
  );
}
