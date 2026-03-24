import { NextRequest } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
  const employees = await storage.getEmployees(false);
  const leaves = await storage.getPaidLeaves(year);
  const leaveMap = new Map(leaves.map(l => [l.employeeId, l]));

  const BOM = "\uFEFF";
  const header = "社員番号,氏名,配属先,入社日,付与日数,繰越日数,消化日数,残日数,時効日数,取得率";
  const rows = employees.map(emp => {
    const l = leaveMap.get(emp.id);
    return [
      emp.id, emp.name, emp.assignment, emp.joinDate,
      l?.grantedDays ?? 0, l?.carriedOverDays ?? 0, l?.consumedDays ?? 0,
      l?.remainingDays ?? 0, l?.expiredDays ?? 0,
      l ? `${(l.usageRate * 100).toFixed(1)}%` : "0%",
    ].join(",");
  });

  return new Response(BOM + header + "\n" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=leave-management-${year}.csv`,
    },
  });
}
