import { storage } from "@/lib/storage";
import { getCycleByIndex } from "@/lib/leave-calc";

export async function validateRecordDateInCycle(
  recordDate: string,
  paidLeaveId: number,
): Promise<void> {
  const pl = await storage.getPaidLeaveById(paidLeaveId);
  if (!pl) {
    throw new Error("対象の有給情報が見つかりません");
  }

  const emp = await storage.getEmployee(pl.employeeId);
  if (!emp || !emp.joinDate) {
    throw new Error("対象社員の入社日が設定されていません");
  }

  const allPl = await storage.getPaidLeaves();
  const empPaidLeaves = allPl
    .filter((p) => p.employeeId === pl.employeeId)
    .sort((a, b) => a.id - b.id);

  const index = empPaidLeaves.findIndex((p) => p.id === paidLeaveId);
  if (index < 0) {
    throw new Error("対象の有給情報が見つかりません");
  }

  const cycle = getCycleByIndex(emp.joinDate, index);
  if (!cycle) {
    throw new Error("サイクル情報を算出できません");
  }

  if (recordDate < cycle.startDate || recordDate > cycle.endDate) {
    throw new Error(
      `記録日（${recordDate}）が対象サイクルの範囲外です（${cycle.startDate}〜${cycle.endDate}）`,
    );
  }
}
