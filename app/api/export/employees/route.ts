import { NextRequest } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const includeRetired = request.nextUrl.searchParams.get("includeRetired") === "true";
  const employees = await storage.getEmployees(includeRetired);

  const BOM = "\uFEFF";
  const header = "社員番号,氏名,配属先,入社日,退職日,ステータス,勤続月数";
  const rows = employees.map(emp => [
    emp.id, emp.name, emp.assignment, emp.joinDate,
    emp.retiredDate || "",
    emp.status === "active" ? "在籍中" : "退職",
    emp.tenureMonths,
  ].join(","));

  return new Response(BOM + header + "\n" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=employees.csv",
    },
  });
}
