import { NextResponse } from "next/server";
import { ensureDbInitialized } from "@/lib/init-db";
import { storage } from "@/lib/storage";

export async function GET() {
  await ensureDbInitialized();
  // Turso is cloud-hosted, so backup info is adapted
  const isTurso = !!process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.startsWith("file:");
  const employees = await storage.getEmployees(true);
  const leaves = await storage.getPaidLeaves();
  const overtimes = await storage.getMonthlyOvertimes();

  return NextResponse.json({
    dbType: isTurso ? "Turso (Cloud)" : "Local SQLite",
    dbUrl: process.env.TURSO_DATABASE_URL || "file:local.db",
    stats: {
      employees: employees.length,
      paidLeaves: leaves.length,
      overtimes: overtimes.length,
    },
    backups: [],
    message: isTurso ? "Tursoクラウドデータベースはサーバー側で自動バックアップされます" : "ローカルDBファイルを使用中",
  });
}
