import { NextRequest } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  await ensureDbInitialized();
  const yearStr = request.nextUrl.searchParams.get("year");
  const year = yearStr ? parseInt(yearStr, 10) : 2025;
  const employees = await storage.getEmployees(false);
  const overtimes = await storage.getMonthlyOvertimes(undefined, year);

  const BOM = "\uFEFF";
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const header = ["社員番号", "氏名", "配属先", ...months.map(m => `${m}月_普通残業`), ...months.map(m => `${m}月_深夜残業`), "年間普通残業計", "年間深夜残業計"].join(",");

  const rows = employees.map(emp => {
    const empOT = overtimes.filter(o => o.employeeId === emp.id);
    const otMap = new Map(empOT.map(o => [o.month, o]));
    const regularHours = months.map(m => otMap.get(m)?.overtimeHours ?? 0);
    const lateNightHours = months.map(m => otMap.get(m)?.lateNightOvertime ?? 0);
    const totalRegular = regularHours.reduce((s, h) => s + h, 0);
    const totalLateNight = lateNightHours.reduce((s, h) => s + h, 0);
    return [emp.id, emp.name, emp.assignment, ...regularHours, ...lateNightHours, totalRegular, totalLateNight].join(",");
  });

  return new Response(BOM + header + "\n" + rows.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=overtime-management-${year}.csv`,
    },
  });
}
