import {
  type Employee, type InsertEmployee,
  type PaidLeave, type InsertPaidLeave,
  type LeaveUsage, type InsertLeaveUsage,
  type MonthlyOvertime, type InsertMonthlyOvertime,
  type AssignmentHistory, type InsertAssignmentHistory,
  type OvertimeAlert, type PaidLeaveAlert, type EmployeeAlert,
  employees, paidLeaves, leaveUsages, monthlyOvertimes, assignmentHistories,
} from "./schema";
import { calcLeaveDeadline, calcExpiryRisk, calcConsumptionPace, calcCarryoverUtil } from "./leave-calc";
import { db, client } from "./db";
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  getEmployees(includeRetired?: boolean): Promise<Employee[]>;
  getEmployee(id: string): Promise<Employee | undefined>;
  getNextEmployeeId(): Promise<string>;
  createEmployee(emp: InsertEmployee): Promise<Employee>;
  updateEmployee(id: string, emp: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: string): Promise<boolean>;
  retireEmployee(id: string, retiredDate: string): Promise<Employee | undefined>;
  reinstateEmployee(id: string): Promise<Employee | undefined>;
  getAssignmentHistories(employeeId: string): Promise<AssignmentHistory[]>;
  createAssignmentHistory(history: InsertAssignmentHistory): Promise<AssignmentHistory>;
  updateAssignmentHistory(id: number, data: Partial<InsertAssignmentHistory>): Promise<AssignmentHistory | undefined>;
  deleteAssignmentHistory(id: number): Promise<boolean>;
  getCurrentAssignment(employeeId: string): Promise<string>;
  getPaidLeaves(fiscalYear?: number): Promise<PaidLeave[]>;
  getPaidLeaveByEmployee(employeeId: string, fiscalYear?: number): Promise<PaidLeave | undefined>;
  upsertPaidLeave(leave: InsertPaidLeave): Promise<PaidLeave>;
  getLeaveUsages(employeeId?: string): Promise<LeaveUsage[]>;
  createLeaveUsage(usage: InsertLeaveUsage): Promise<LeaveUsage>;
  deleteLeaveUsage(id: number): Promise<boolean>;
  getMonthlyOvertimes(employeeId?: string, year?: number): Promise<MonthlyOvertime[]>;
  upsertMonthlyOvertime(ot: InsertMonthlyOvertime): Promise<MonthlyOvertime>;
  getOvertimeAlerts(year?: number): Promise<OvertimeAlert[]>;
  getPaidLeaveAlerts(fiscalYear?: number): Promise<PaidLeaveAlert[]>;
  getAllAlerts(year?: number): Promise<EmployeeAlert[]>;
  getEmployeeSummaries(year?: number): Promise<any[]>;
  bulkImportEmployees(employees: InsertEmployee[]): Promise<{ added: number; updated: number; skipped: number; skippedNames: string[] }>;
  bulkImportPaidLeaves(leaves: InsertPaidLeave[]): Promise<{ count: number; skipped: number }>;
}

// ── 複合リスク判定 + 自動コメント生成 ──
type CompositeRiskLevel = "high" | "medium" | null;
function generateCompositeRisk(
  leaveAlerts: EmployeeAlert[],
  overtimeAlerts: EmployeeAlert[],
  leave: PaidLeave | null | undefined,
  yearlyOT: number,
): { compositeRisk: CompositeRiskLevel; compositeComment: string | null } {
  const sevRank = (s: string) => ({ danger: 4, warning: 3, caution: 2, info: 1, notice: 0 }[s] ?? 0);
  const leaveMax = leaveAlerts.reduce((mx, a) => Math.max(mx, sevRank(a.severity)), 0);
  const otMax = overtimeAlerts.reduce((mx, a) => Math.max(mx, sevRank(a.severity)), 0);

  const hasLeaveIssue = leaveMax >= 3; // warning以上
  const hasOtIssue = otMax >= 3;

  if (!hasLeaveIssue || !hasOtIssue) {
    return { compositeRisk: null, compositeComment: null };
  }

  // 複合リスク判定
  const level: CompositeRiskLevel = (leaveMax >= 4 || otMax >= 4) ? "high" : "medium";

  // 状況説明テキスト生成
  const usageRate = leave ? Math.round(leave.usageRate * 100) : 0;
  const otParts: string[] = [];
  const leaveParts: string[] = [];

  for (const a of overtimeAlerts) {
    if (a.severity === "danger") otParts.push(a.message);
    else if (a.severity === "warning" && otParts.length === 0) otParts.push(a.message);
  }
  for (const a of leaveAlerts) {
    if (a.severity === "danger" || a.severity === "warning") leaveParts.push(a.message);
  }

  const situation = level === "high"
    ? `【安全配慮義務リスク】残業に法令違反があり、有給取得率${usageRate}%で休息も不十分。疲労蓄積が深刻な状態です。`
    : `【複合リスク】残業が法令上限に接近中かつ有給取得率${usageRate}%。休息不足による疲労蓄積が懸念されます。`;

  // 改善アクション生成
  const actions: string[] = [];
  if (otMax >= 4) {
    actions.push("残業を直ちに月35h以内に抑制");
  } else if (otMax >= 3) {
    actions.push("残業の月45h超過を回避するよう業務調整");
  }
  if (usageRate < 30) {
    actions.push("2週間以内に有給1日以上の取得を指示");
  } else {
    actions.push("月1日以上の計画的な有給取得を推奨");
  }
  actions.push("所属長との面談を実施し、業務負荷を確認");

  const comment = `${situation}\n推奨アクション: ${actions.join(" / ")}`;

  return { compositeRisk: level, compositeComment: comment };
}

export class TursoStorage implements IStorage {

  // ── Employees ──
  async getEmployees(includeRetired: boolean = false): Promise<Employee[]> {
    let all = await db.select().from(employees);
    if (!includeRetired) {
      all = all.filter(e => e.status !== "retired");
    }
    return all.sort((a, b) => {
      const numA = parseInt(a.id, 10);
      const numB = parseInt(b.id, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.id.localeCompare(b.id);
    });
  }

  async getEmployee(id: string): Promise<Employee | undefined> {
    const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return rows[0];
  }

  async getNextEmployeeId(): Promise<string> {
    const result = await client.execute(
      `SELECT MAX(CAST(id AS INTEGER)) as maxId FROM employees WHERE CAST(id AS INTEGER) > 0`
    );
    const maxId = result.rows[0]?.maxId as number | null;
    return String((maxId ?? 0) + 1);
  }

  async createEmployee(emp: InsertEmployee): Promise<Employee> {
    const id = emp.id || await this.getNextEmployeeId();
    const rows = await db.insert(employees).values({
      id,
      name: emp.name,
      assignment: emp.assignment ?? "-",
      joinDate: emp.joinDate ?? "",
      retiredDate: emp.retiredDate ?? "",
      status: emp.status ?? "active",
      tenureMonths: emp.tenureMonths ?? 0,
    }).returning();
    return rows[0];
  }

  async updateEmployee(id: string, emp: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const existing = await this.getEmployee(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...emp, id };
    await db.update(employees).set(updated).where(eq(employees.id, id));
    const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return rows[0];
  }

  async deleteEmployee(id: string): Promise<boolean> {
    const existing = await this.getEmployee(id);
    if (!existing) return false;
    await db.delete(paidLeaves).where(eq(paidLeaves.employeeId, id));
    await db.delete(monthlyOvertimes).where(eq(monthlyOvertimes.employeeId, id));
    await db.delete(leaveUsages).where(eq(leaveUsages.employeeId, id));
    await db.delete(assignmentHistories).where(eq(assignmentHistories.employeeId, id));
    await db.delete(employees).where(eq(employees.id, id));
    return true;
  }

  async retireEmployee(id: string, retiredDate: string): Promise<Employee | undefined> {
    const existing = await this.getEmployee(id);
    if (!existing) return undefined;
    const histories = await this.getAssignmentHistories(id);
    const openHistory = histories.find(h => h.endDate === "");
    if (openHistory) {
      await this.updateAssignmentHistory(openHistory.id, { endDate: retiredDate });
    }
    await db.update(employees).set({ status: "retired", retiredDate, assignment: "-" }).where(eq(employees.id, id));
    const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return rows[0];
  }

  async reinstateEmployee(id: string): Promise<Employee | undefined> {
    const existing = await this.getEmployee(id);
    if (!existing) return undefined;
    await db.update(employees).set({ status: "active", retiredDate: "" }).where(eq(employees.id, id));
    const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
    return rows[0];
  }

  // ── Assignment Histories ──
  async getAssignmentHistories(employeeId: string): Promise<AssignmentHistory[]> {
    const rows = await db.select().from(assignmentHistories)
      .where(eq(assignmentHistories.employeeId, employeeId));
    return rows.sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  async createAssignmentHistory(history: InsertAssignmentHistory): Promise<AssignmentHistory> {
    const rows = await db.insert(assignmentHistories).values({
      employeeId: history.employeeId,
      assignment: history.assignment ?? "-",
      startDate: history.startDate,
      endDate: history.endDate ?? "",
      note: history.note ?? "",
    }).returning();
    const ah = rows[0];
    if (ah.endDate === "") {
      await this.syncCurrentAssignment(ah.employeeId);
    }
    return ah;
  }

  async updateAssignmentHistory(id: number, data: Partial<InsertAssignmentHistory>): Promise<AssignmentHistory | undefined> {
    const existingRows = await db.select().from(assignmentHistories).where(eq(assignmentHistories.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) return undefined;
    const merged = { ...existing, ...data, id };
    await db.update(assignmentHistories).set(merged).where(eq(assignmentHistories.id, id));
    const updatedRows = await db.select().from(assignmentHistories).where(eq(assignmentHistories.id, id)).limit(1);
    const updated = updatedRows[0];
    if (updated) await this.syncCurrentAssignment(updated.employeeId);
    return updated;
  }

  async deleteAssignmentHistory(id: number): Promise<boolean> {
    const existingRows = await db.select().from(assignmentHistories).where(eq(assignmentHistories.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) return false;
    const empId = existing.employeeId;
    await db.delete(assignmentHistories).where(eq(assignmentHistories.id, id));
    await this.syncCurrentAssignment(empId);
    return true;
  }

  async getCurrentAssignment(employeeId: string): Promise<string> {
    const histories = await this.getAssignmentHistories(employeeId);
    const current = histories.find(h => h.endDate === "");
    return current ? current.assignment : "-";
  }

  private async syncCurrentAssignment(employeeId: string): Promise<void> {
    const emp = await this.getEmployee(employeeId);
    if (!emp || emp.status === "retired") return;
    const currentAssignment = await this.getCurrentAssignment(employeeId);
    if (emp.assignment !== currentAssignment) {
      await db.update(employees).set({ assignment: currentAssignment }).where(eq(employees.id, employeeId));
    }
  }

  // ── Paid Leaves ──
  async getPaidLeaves(fiscalYear?: number): Promise<PaidLeave[]> {
    if (fiscalYear != null) {
      return await db.select().from(paidLeaves).where(eq(paidLeaves.fiscalYear, fiscalYear));
    }
    return await db.select().from(paidLeaves);
  }

  async getPaidLeaveByEmployee(employeeId: string, fiscalYear: number = 2025): Promise<PaidLeave | undefined> {
    const rows = await db.select().from(paidLeaves)
      .where(and(eq(paidLeaves.employeeId, employeeId), eq(paidLeaves.fiscalYear, fiscalYear)))
      .limit(1);
    return rows[0];
  }

  async upsertPaidLeave(leave: InsertPaidLeave): Promise<PaidLeave> {
    const fy = leave.fiscalYear ?? 2025;
    const existing = await this.getPaidLeaveByEmployee(leave.employeeId, fy);
    if (existing) {
      // 取得履歴がある社員は消化日数・残日数・取得率を保護（自動計算優先）
      const usages = await this.getLeaveUsages(leave.employeeId);
      const hasUsages = usages.length > 0;
      const updated = {
        employeeId: leave.employeeId,
        fiscalYear: fy,
        grantedDays: leave.grantedDays ?? existing.grantedDays,
        carriedOverDays: leave.carriedOverDays ?? existing.carriedOverDays,
        consumedDays: hasUsages ? existing.consumedDays : (leave.consumedDays ?? existing.consumedDays),
        remainingDays: hasUsages ? existing.remainingDays : (leave.remainingDays ?? existing.remainingDays),
        expiredDays: leave.expiredDays ?? existing.expiredDays,
        usageRate: hasUsages ? existing.usageRate : (leave.usageRate ?? existing.usageRate),
      };
      await db.update(paidLeaves).set(updated).where(eq(paidLeaves.id, existing.id));
      const rows = await db.select().from(paidLeaves).where(eq(paidLeaves.id, existing.id)).limit(1);
      return rows[0]!;
    }
    const rows = await db.insert(paidLeaves).values({
      employeeId: leave.employeeId,
      fiscalYear: fy,
      grantedDays: leave.grantedDays ?? 0,
      carriedOverDays: leave.carriedOverDays ?? 0,
      consumedDays: leave.consumedDays ?? 0,
      remainingDays: leave.remainingDays ?? 0,
      expiredDays: leave.expiredDays ?? 0,
      usageRate: leave.usageRate ?? 0,
    }).returning();
    return rows[0];
  }

  // ── Leave Usages ──
  async getLeaveUsages(employeeId?: string): Promise<LeaveUsage[]> {
    if (employeeId) {
      return await db.select().from(leaveUsages).where(eq(leaveUsages.employeeId, employeeId));
    }
    return await db.select().from(leaveUsages);
  }

  async createLeaveUsage(usage: InsertLeaveUsage): Promise<LeaveUsage> {
    const rows = await db.insert(leaveUsages).values({
      employeeId: usage.employeeId,
      startDate: usage.startDate,
      endDate: usage.endDate,
      days: usage.days ?? 1,
      reason: usage.reason ?? "",
    }).returning();
    return rows[0];
  }

  async deleteLeaveUsage(id: number): Promise<boolean> {
    const existingRows = await db.select().from(leaveUsages).where(eq(leaveUsages.id, id)).limit(1);
    if (!existingRows[0]) return false;
    await db.delete(leaveUsages).where(eq(leaveUsages.id, id));
    return true;
  }

  // ── Monthly Overtimes ──
  async getMonthlyOvertimes(employeeId?: string, year?: number): Promise<MonthlyOvertime[]> {
    let all = await db.select().from(monthlyOvertimes);
    if (employeeId) all = all.filter(o => o.employeeId === employeeId);
    if (year != null) all = all.filter(o => o.year === year);
    return all.sort((a, b) => a.month - b.month);
  }

  async upsertMonthlyOvertime(ot: InsertMonthlyOvertime): Promise<MonthlyOvertime> {
    const existingRows = await db.select().from(monthlyOvertimes)
      .where(and(
        eq(monthlyOvertimes.employeeId, ot.employeeId),
        eq(monthlyOvertimes.year, ot.year),
        eq(monthlyOvertimes.month, ot.month)
      ))
      .limit(1);
    const existing = existingRows[0];
    if (existing) {
      await db.update(monthlyOvertimes).set({
        overtimeHours: ot.overtimeHours ?? 0,
        lateNightOvertime: ot.lateNightOvertime ?? 0,
      }).where(eq(monthlyOvertimes.id, existing.id));
      const rows = await db.select().from(monthlyOvertimes).where(eq(monthlyOvertimes.id, existing.id)).limit(1);
      return rows[0]!;
    }
    const rows = await db.insert(monthlyOvertimes).values({
      employeeId: ot.employeeId,
      year: ot.year,
      month: ot.month,
      overtimeHours: ot.overtimeHours ?? 0,
      lateNightOvertime: ot.lateNightOvertime ?? 0,
    }).returning();
    return rows[0];
  }

  // ── Overtime Alerts ──
  async getOvertimeAlerts(year: number = 2025): Promise<OvertimeAlert[]> {
    const alerts: OvertimeAlert[] = [];
    const emps = await this.getEmployees(false);
    const overtimes = await this.getMonthlyOvertimes(undefined, year);

    for (const emp of emps) {
      const empOT = overtimes.filter(o => o.employeeId === emp.id);
      if (empOT.length === 0) continue;

      const over45Months = empOT.filter(o => o.overtimeHours > 45);
      for (const o of over45Months) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "monthly_45h", severity: "danger",
          message: `${o.month}月の残業が${o.overtimeHours}時間（36協定原則上限4 5h超過）`,
          value: o.overtimeHours,
        });
      }

      const over100Months = empOT.filter(o => o.overtimeHours >= 100);
      for (const o of over100Months) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "monthly_100h", severity: "danger",
          message: `${o.month}月の残業が${o.overtimeHours}時間（100h超過）— 産業医面談義務（安衛法66条の8）`,
          value: o.overtimeHours,
        });
      }

      const over80Not100Months = empOT.filter(o => o.overtimeHours >= 80 && o.overtimeHours < 100);
      for (const o of over80Not100Months) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "monthly_100h", severity: "warning",
          message: `${o.month}月の残業が${o.overtimeHours}時間（80h超過・過労死ライン）— 産業医面談の申出勧奨が必要`,
          value: o.overtimeHours,
        });
      }

      const over35Months = empOT.filter(o => o.overtimeHours > 35 && o.overtimeHours <= 45);
      for (const o of over35Months) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "monthly_45h", severity: "warning",
          message: `${o.month}月の残業が${o.overtimeHours}時間（36協定上限45hに接近）`,
          value: o.overtimeHours,
        });
      }

      const yearlyTotal = empOT.reduce((sum, o) => sum + o.overtimeHours, 0);
      if (yearlyTotal > 360) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "yearly_360h", severity: "danger",
          message: `年間残業が${yearlyTotal.toFixed(1)}時間（36協定年間上限360h超過）`,
          value: yearlyTotal,
        });
      } else if (yearlyTotal > 300) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "yearly_360h", severity: "warning",
          message: `年間残業が${yearlyTotal.toFixed(1)}時間（36協定年間上限360hに接近）`,
          value: yearlyTotal,
        });
      }

      if (yearlyTotal > 720) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "yearly_720h", severity: "danger",
          message: `年間残業が${yearlyTotal.toFixed(1)}時間（特別条項上限720h超過）`,
          value: yearlyTotal,
        });
      }

      const over45Count = over45Months.length;
      if (over45Count > 6) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "over45_count", severity: "danger",
          message: `月45h超過が年${over45Count}回（特別条項上限年6回を超過）`,
          value: over45Count,
        });
      } else if (over45Count >= 5) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "over45_count", severity: "warning",
          message: `月45h超過が年${over45Count}回（特別条項上限年6回まであと${6 - over45Count}回）`,
          value: over45Count,
        });
      }

      const sortedOT = [...empOT].sort((a, b) => a.month - b.month);
      let worstAvg = 0;
      let worstWindow = 0;
      let worstMonths: number[] = [];
      for (let window = 2; window <= 6; window++) {
        for (let i = 0; i <= sortedOT.length - window; i++) {
          const chunk = sortedOT.slice(i, i + window);
          const avg = chunk.reduce((s, o) => s + o.overtimeHours, 0) / window;
          if (avg > worstAvg) {
            worstAvg = avg;
            worstWindow = window;
            worstMonths = chunk.map(o => o.month);
          }
        }
      }
      if (worstAvg > 80) {
        const monthsStr = worstMonths.map(m => `${m}月`).join("・");
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "multi_month_avg", severity: "danger",
          message: `${worstWindow}ヶ月平均${worstAvg.toFixed(1)}h（${monthsStr}）— 過労死ライン超過（80h基準）`,
          value: worstAvg,
        });
      } else if (worstAvg > 70) {
        const monthsStr = worstMonths.map(m => `${m}月`).join("・");
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "multi_month_avg", severity: "warning",
          message: `${worstWindow}ヶ月平均${worstAvg.toFixed(1)}h（${monthsStr}）— 過労死ラインに接近（70h超）`,
          value: worstAvg,
        });
      } else if (worstAvg > 60) {
        const monthsStr = worstMonths.map(m => `${m}月`).join("・");
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "multi_month_avg", severity: "caution",
          message: `${worstWindow}ヶ月平均${worstAvg.toFixed(1)}h（${monthsStr}）— 健康障害リスク上昇域（60h超）。残業配分の見直しを推奨`,
          value: worstAvg,
        });
      }
    }
    return alerts;
  }

  // ── Paid Leave Alerts ──
  async getPaidLeaveAlerts(fiscalYear: number = 2025): Promise<PaidLeaveAlert[]> {
    const alerts: PaidLeaveAlert[] = [];
    const emps = await this.getEmployees(false);
    const leaves = await this.getPaidLeaves(fiscalYear);
    const now = new Date();

    for (const emp of emps) {
      const leave = leaves.find(l => l.employeeId === emp.id);
      if (!leave) continue;

      if (leave.remainingDays <= 0) {
        const deadline = calcLeaveDeadline(emp.joinDate, leave.consumedDays, now);
        if (deadline.isObligationTarget && leave.consumedDays < 5) {
          const totalGranted = leave.grantedDays + leave.carriedOverDays;
          const lostDays = totalGranted - leave.consumedDays;
          const carryoverNote = leave.carriedOverDays > 0
            ? `（うち繰越${leave.carriedOverDays}日を含む${totalGranted}日が付与済み）`
            : `（${totalGranted}日が付与済み）`;
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "zero_remaining", severity: "notice",
            message: `残日数0日・年5日義務未達成（${leave.consumedDays}日のみ取得）${carryoverNote}。${lostDays}日分が未取得のまま失効。使用者の時季指定義務違反に該当する可能性があり、労基法第39条第7項に基づき30万円以下の罰金の対象となり得ます`,
            value: leave.consumedDays,
          });
        }
        continue;
      }

      const totalAvailable = leave.grantedDays + leave.carriedOverDays;
      const deadline = calcLeaveDeadline(emp.joinDate, leave.consumedDays, now);

      if (deadline.isObligationTarget && leave.consumedDays < 5) {
        const remaining = deadline.remainingObligation;
        if (deadline.paceStatus === "overdue") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "danger",
            message: `年5日義務の期限超過（${deadline.obligationDeadline}期限、${leave.consumedDays}日のみ取得）`,
            value: leave.consumedDays,
          });
        } else if (deadline.paceStatus === "danger") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "danger",
            message: `期限まで${deadline.daysUntilDeadline}日、あと${remaining}日必要（${deadline.obligationDeadline}まで）`,
            value: leave.consumedDays,
          });
        } else if (deadline.paceStatus === "tight") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "warning",
            message: `期限まで${deadline.daysUntilDeadline}日、あと${remaining}日必要（${deadline.obligationDeadline}まで）`,
            value: leave.consumedDays,
          });
        } else {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "info",
            message: `年5日義務に対し${leave.consumedDays}日取得（ペース順調・${deadline.obligationDeadline}までにあと${remaining}日）`,
            value: leave.consumedDays,
          });
        }
      }

      if (totalAvailable > 0 && leave.usageRate < 0.3 && leave.consumedDays >= 5) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "low_usage_rate", severity: "warning",
          message: `有給取得率が${(leave.usageRate * 100).toFixed(0)}%（30%未満）。使用者の時季指定義務（労基法39条）に基づき、取得促進が必要`,
          value: leave.usageRate,
        });
      }

      const expiryRisk = calcExpiryRisk(leave.remainingDays, deadline.daysUntilDeadline, deadline.paceStatus);
      const isHighUsageRate = leave.usageRate >= 0.7;
      if (expiryRisk.riskLevel === "high") {
        if (!isHighUsageRate) {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "expiry_risk", severity: "danger",
            message: expiryRisk.message,
            value: expiryRisk.expiryDays,
          });
        }
      } else if (expiryRisk.riskLevel === "medium") {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "expiry_risk", severity: "info",
          message: expiryRisk.message,
          value: expiryRisk.expiryDays,
        });
      }

      const carryoverUtil = calcCarryoverUtil(
        leave.carriedOverDays, leave.consumedDays, leave.remainingDays,
        leave.grantedDays, deadline.daysUntilDeadline
      );
      if (carryoverUtil.utilLevel === "danger") {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "carryover_risk",
          severity: isHighUsageRate ? "info" : "warning",
          message: isHighUsageRate
            ? `取得率良好ですが、繰越${carryoverUtil.carriedOverDays}日のうち${carryoverUtil.unusedCarryover}日が未消化`
            : carryoverUtil.message,
          value: carryoverUtil.unusedCarryover,
        });
      }

      // 時効消滅アラート（他のアラートと独立して発行）
      if (leave.expiredDays > 0) {
        if (!isHighUsageRate) {
          const ratePercent = (leave.usageRate * 100).toFixed(0);
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "expired_low_rate", severity: "caution",
            message: `時効消滅${leave.expiredDays}日・取得率${ratePercent}%。休息不足による疲労蓄積リスク（厳労働省・過重労働防止GL）。月1日以上の計画的な取得推奨`,
            value: leave.expiredDays,
          });
        } else {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "expiring_soon", severity: "notice",
            message: `時効消滅が${leave.expiredDays}日発生（取得率${(leave.usageRate * 100).toFixed(0)}%で良好）`,
            value: leave.expiredDays,
          });
        }
      }
      // 失効見込み（取得率良好）— 独立発行
      if (expiryRisk.riskLevel === "high" && isHighUsageRate) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "expiry_risk", severity: "notice",
          message: `取得率${(leave.usageRate * 100).toFixed(0)}%で良好ですが、${expiryRisk.expiryDays}日分が失効見込み`,
          value: expiryRisk.expiryDays,
        });
      }
    }
    return alerts;
  }

  // ── All Alerts Combined ──
  async getAllAlerts(year: number = 2025): Promise<EmployeeAlert[]> {
    const overtimeAlerts = await this.getOvertimeAlerts(year);
    const leaveAlerts = await this.getPaidLeaveAlerts(year);

    // 各アラートは独立発行—抑制なしで統合
    const all: EmployeeAlert[] = [
      ...overtimeAlerts.map(a => ({ ...a, category: "overtime" as const })),
      ...leaveAlerts.map(a => ({ ...a, category: "paid_leave" as const })),
    ];

    const severityOrder: Record<string, number> = { danger: 0, warning: 1, caution: 2, info: 3, notice: 4 };
    all.sort((a, b) => {
      const diff = severityOrder[a.severity] - severityOrder[b.severity];
      if (diff !== 0) return diff;
      return a.employeeName.localeCompare(b.employeeName, "ja");
    });

    return all;
  }

  // ── Employee Summaries ──
  async getEmployeeSummaries(year: number = 2025): Promise<any[]> {
    const emps = await this.getEmployees(false);
    const leaves = await this.getPaidLeaves(year);
    const overtimes = await this.getMonthlyOvertimes(undefined, year);
    const allAlerts = await this.getAllAlerts(year);

    const leaveMap = new Map(leaves.map(l => [l.employeeId, l]));
    const now = new Date();

    return emps.map(emp => {
      const leave = leaveMap.get(emp.id);
      const empOT = overtimes.filter(o => o.employeeId === emp.id);
      const yearlyOT = empOT.reduce((sum, o) => sum + o.overtimeHours, 0);
      const empAlerts = allAlerts.filter(a => a.employeeId === emp.id);
      const leaveAlerts = empAlerts.filter(a => a.category === "paid_leave");
      const overtimeAlerts = empAlerts.filter(a => a.category === "overtime");

      const dangerCount = empAlerts.filter(a => a.severity === "danger").length;
      const warningCount = empAlerts.filter(a => a.severity === "warning").length;
      const cautionCount = empAlerts.filter(a => a.severity === "caution").length;
      const infoCount = empAlerts.filter(a => a.severity === "info").length;
      const noticeCount = empAlerts.filter(a => a.severity === "notice").length;

      const leaveDangerCount = leaveAlerts.filter(a => a.severity === "danger").length;
      const leaveWarningCount = leaveAlerts.filter(a => a.severity === "warning").length;
      const leaveCautionCount = leaveAlerts.filter(a => a.severity === "caution").length;
      const leaveInfoCount = leaveAlerts.filter(a => a.severity === "info").length;
      const leaveNoticeCount = leaveAlerts.filter(a => a.severity === "notice").length;
      const overtimeDangerCount = overtimeAlerts.filter(a => a.severity === "danger").length;
      const overtimeWarningCount = overtimeAlerts.filter(a => a.severity === "warning").length;
      const overtimeCautionCount = overtimeAlerts.filter(a => a.severity === "caution").length;
      const overtimeInfoCount = overtimeAlerts.filter(a => a.severity === "info").length;

      const deadline = calcLeaveDeadline(emp.joinDate, leave?.consumedDays ?? 0, now);
      const expiryRisk = leave ? calcExpiryRisk(leave.remainingDays, deadline.daysUntilDeadline, deadline.paceStatus) : null;
      const consumptionPace = leave ? calcConsumptionPace(leave.grantedDays, leave.consumedDays, emp.joinDate, now) : null;
      const carryoverUtil = leave ? calcCarryoverUtil(leave.carriedOverDays, leave.consumedDays, leave.remainingDays, leave.grantedDays, deadline.daysUntilDeadline) : null;

      return {
        id: emp.id, name: emp.name, assignment: emp.assignment, status: emp.status,
        paidLeave: leave ? {
          consumedDays: leave.consumedDays, remainingDays: leave.remainingDays,
          totalAvailable: leave.grantedDays + leave.carriedOverDays,
          usageRate: leave.usageRate, grantedDays: leave.grantedDays,
          carriedOverDays: leave.carriedOverDays, expiredDays: leave.expiredDays,
        } : null,
        overtime: { yearlyTotal: yearlyOT, monthlyData: empOT },
        deadline,
        health: { expiryRisk, consumptionPace, carryoverUtil },
        alerts: empAlerts,
        dangerCount, warningCount, cautionCount, infoCount, noticeCount,
        leaveDangerCount, leaveWarningCount, leaveCautionCount, leaveInfoCount, leaveNoticeCount,
        leaveAlertCount: leaveAlerts.length,
        overtimeDangerCount, overtimeWarningCount, overtimeCautionCount, overtimeInfoCount,
        overtimeAlertCount: overtimeAlerts.length,
        alertCount: empAlerts.length,
        // ── 複合リスク判定 ──
        ...generateCompositeRisk(leaveAlerts, overtimeAlerts, leave, yearlyOT),
      };
    });
  }

  // ── Bulk Import ──
  async bulkImportEmployees(emps: InsertEmployee[]): Promise<{ added: number; updated: number; skipped: number; skippedNames: string[] }> {
    let added = 0, updated = 0, skipped = 0;
    const skippedNames: string[] = [];
    for (const emp of emps) {
      if (!emp.id || !emp.name || emp.name.trim() === "") {
        skipped++;
        skippedNames.push(emp.id ? `ID:${emp.id}（名前なし）` : `（IDなし: ${emp.name || "不明"})`);
        continue;
      }
      const existing = await this.getEmployee(String(emp.id));
      if (existing) {
        const merged = {
          name: emp.name.trim() || existing.name,
          assignment: emp.assignment ?? existing.assignment,
          joinDate: emp.joinDate ?? existing.joinDate,
          retiredDate: emp.retiredDate ?? existing.retiredDate,
          status: emp.status ?? existing.status,
          tenureMonths: emp.tenureMonths ?? existing.tenureMonths,
        };
        await db.update(employees).set(merged).where(eq(employees.id, existing.id));
        updated++;
      } else {
        await this.createEmployee(emp);
        added++;
      }
    }
    return { added, updated, skipped, skippedNames };
  }

  async bulkImportPaidLeaves(leaves: InsertPaidLeave[]): Promise<{ count: number; skipped: number }> {
    let count = 0, skipped = 0;
    for (const leave of leaves) {
      if (!leave.employeeId) { skipped++; continue; }
      await this.upsertPaidLeave(leave);
      count++;
    }
    return { count, skipped };
  }

  // ── Meta ──
  async getMetaValue(key: string): Promise<string | undefined> {
    const result = await client.execute({ sql: "SELECT value FROM _meta WHERE key = ?", args: [key] });
    return result.rows[0]?.value as string | undefined;
  }

  async setMetaValue(key: string, value: string): Promise<void> {
    await client.execute({ sql: "INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)", args: [key, value] });
  }
}

export const storage = new TursoStorage();
