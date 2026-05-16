import {
  type Employee, type InsertEmployee,
  type PaidLeave, type InsertPaidLeave,
  type LeaveUsage, type InsertLeaveUsage,
  type MonthlyOvertime, type InsertMonthlyOvertime,
  type AssignmentHistory, type InsertAssignmentHistory,
  type SpecialLeave, type InsertSpecialLeave,
  type OvertimeAlert, type PaidLeaveAlert, type EmployeeAlert,
  type LeaveUsageHistoryRecord,
  employees, paidLeaves, leaveUsages, monthlyOvertimes, assignmentHistories, specialLeaves,
  leaveUsageHistory,
} from "./schema";
import { adjustmentDaysSchema, reasonSchema, voidLeaveUsageSchema } from "./validations/leave-usage";
import { calcLeaveDeadline, calcExpiryRisk, calcConsumptionPace, calcCarryoverUtil, calcAutoExpiredDays, calcConsumedDaysFromUsages, calcRemainingDays, calcUsageRate } from "./leave-calc";
import { db, client } from "./db";
import { eq, and, sql, desc } from "drizzle-orm";

// PR-1: getPaidLeaveByEmployee の拡張戻り値型
export interface PaidLeaveExtended extends PaidLeave {
  consumedDays: number;
  remainingDays: number;
  usageRate: number;
  adjustedRemainingDays: number;
  autoRemainingDays: number;
  carriedOverBreakdown: {
    auto: number;
    adjustmentDerived: number;
  };
}

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
  getPaidLeaves(): Promise<PaidLeave[]>;
  getPaidLeaveByEmployee(employeeId: string): Promise<PaidLeaveExtended | undefined>;
  upsertPaidLeave(leave: InsertPaidLeave): Promise<PaidLeave>;
  getLeaveUsages(employeeId?: string): Promise<LeaveUsage[]>;
  createLeaveUsage(usage: InsertLeaveUsage): Promise<LeaveUsage>;
  deleteLeaveUsage(id: number): Promise<boolean>;
  addLeaveAdjustment(params: { paidLeaveId: number; recordDate: string; days: number; reason: string; note?: string }): Promise<LeaveUsage>;
  voidLeaveUsage(params: { leaveUsageId: number; voidedReason: string }): Promise<LeaveUsage>;
  splitLeaveAdjustment(params: { leaveUsageId: number; splits: { recordDate: string; days: number }[]; reason: string }): Promise<LeaveUsage[]>;
  confirmLeaveAdjustmentDate(params: { leaveUsageId: number; recordDate: string; reason: string }): Promise<LeaveUsage>;
  getMonthlyOvertimes(employeeId?: string, year?: number): Promise<MonthlyOvertime[]>;
  upsertMonthlyOvertime(ot: InsertMonthlyOvertime): Promise<MonthlyOvertime>;
  getOvertimeAlerts(year?: number): Promise<OvertimeAlert[]>;
  getPaidLeaveAlerts(): Promise<PaidLeaveAlert[]>;
  getAllAlerts(year?: number): Promise<EmployeeAlert[]>;
  getEmployeeSummaries(year?: number): Promise<any[]>;
  getSpecialLeaves(employeeId?: string): Promise<SpecialLeave[]>;
  createSpecialLeave(leave: InsertSpecialLeave): Promise<SpecialLeave>;
  deleteSpecialLeave(id: number): Promise<boolean>;
  bulkImportEmployees(employees: InsertEmployee[]): Promise<{ added: number; updated: number; skipped: number; skippedNames: string[] }>;
  bulkImportPaidLeaves(leaves: InsertPaidLeave[]): Promise<{ count: number; skipped: number }>;
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
    const id = await this.getNextEmployeeId();
    const rows = await db.insert(employees).values({
      id,
      name: emp.name,
      assignment: emp.assignment ?? "-",
      joinDate: emp.joinDate ?? "",
      retiredDate: emp.retiredDate ?? "",
      status: emp.status ?? "active",
      tenureMonths: emp.tenureMonths ?? 0,
      memo: emp.memo ?? "",
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
  async getPaidLeaves(): Promise<PaidLeave[]> {
    return await db.select().from(paidLeaves);
  }

  async getPaidLeaveByEmployee(employeeId: string): Promise<PaidLeaveExtended | undefined> {
    const rows = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.employeeId, employeeId))
      .orderBy(desc(paidLeaves.id))
      .limit(1);
    const leave = rows[0];
    if (!leave) return undefined;

    const usages = await db.select().from(leaveUsages)
      .where(and(
        eq(leaveUsages.paidLeaveId, leave.id),
        eq(leaveUsages.isVoided, 0),
      ));

    const allTotal = usages.reduce((sum, u) => sum + u.days, 0);
    const usageOnlyTotal = usages
      .filter((u) => u.recordType === "usage")
      .reduce((sum, u) => sum + u.days, 0);
    const adjustmentTotal = usages
      .filter((u) => u.recordType === "adjustment")
      .reduce((sum, u) => sum + u.days, 0);

    const expired = calcAutoExpiredDays(leave.carriedOverDays, allTotal);
    const adjustedRemainingDays = Math.max(0,
      leave.grantedDays + leave.carriedOverDays - allTotal - expired);

    const expiredAuto = calcAutoExpiredDays(leave.carriedOverDays, usageOnlyTotal);
    const autoRemainingDays = Math.max(0,
      leave.grantedDays + leave.carriedOverDays - usageOnlyTotal - expiredAuto);

    const consumedDays = allTotal;
    const computedExpired = calcAutoExpiredDays(leave.carriedOverDays, consumedDays);
    const derivedRemainingDays = Math.max(0, leave.grantedDays + leave.carriedOverDays - consumedDays - computedExpired);
    const derivedUsageRate = calcUsageRate({
      grantedDays: leave.grantedDays,
      carriedOverDays: leave.carriedOverDays,
      consumedDays,
    });

    return {
      ...leave,
      consumedDays,
      remainingDays: derivedRemainingDays,
      usageRate: derivedUsageRate,
      adjustedRemainingDays,
      autoRemainingDays,
      carriedOverBreakdown: {
        auto: leave.carriedOverDays,
        adjustmentDerived: -adjustmentTotal,
      },
    };
  }

  async upsertPaidLeave(leave: InsertPaidLeave): Promise<PaidLeave> {
    const existing = await this.getPaidLeaveByEmployee(leave.employeeId);
    if (existing) {
      const updated = {
        employeeId: leave.employeeId,
        grantedDays: leave.grantedDays ?? existing.grantedDays,
        carriedOverDays: leave.carriedOverDays ?? existing.carriedOverDays,
        expiredDays: leave.expiredDays ?? existing.expiredDays,
      };
      await db.update(paidLeaves).set(updated).where(eq(paidLeaves.id, existing.id));
      const rows = await db.select().from(paidLeaves).where(eq(paidLeaves.id, existing.id)).limit(1);
      return rows[0]!;
    }
    const rows = await db.insert(paidLeaves).values({
      employeeId: leave.employeeId,
      grantedDays: leave.grantedDays ?? 0,
      carriedOverDays: leave.carriedOverDays ?? 0,
      expiredDays: leave.expiredDays ?? 0,
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

  async addLeaveAdjustment(params: {
    paidLeaveId: number;
    recordDate: string;
    days: number;
    reason: string;
    note?: string;
  }): Promise<LeaveUsage> {
    adjustmentDaysSchema.parse(params.days);
    reasonSchema.parse(params.reason);

    const plRows = await db.select().from(paidLeaves)
      .where(eq(paidLeaves.id, params.paidLeaveId)).limit(1);
    if (!plRows[0]) {
      throw new Error("対象の有給情報が見つかりません");
    }

    const now = new Date().toISOString();
    const rows = await db.insert(leaveUsages).values({
      employeeId: plRows[0].employeeId,
      startDate: params.recordDate,
      endDate: params.recordDate,
      paidLeaveId: params.paidLeaveId,
      recordDate: params.recordDate,
      days: params.days,
      note: params.note ?? null,
      recordType: "adjustment",
      reason: params.reason,
      isVoided: 0,
      voidedAt: null,
      voidedReason: null,
      createdAt: now,
      updatedAt: now,
    }).returning();
    return rows[0];
  }

  async voidLeaveUsage(params: {
    leaveUsageId: number;
    voidedReason: string;
  }): Promise<LeaveUsage> {
    voidLeaveUsageSchema.parse({ voided_reason: params.voidedReason });

    return await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(leaveUsages)
        .where(eq(leaveUsages.id, params.leaveUsageId)).limit(1);
      const existing = existingRows[0];
      if (!existing) {
        throw new Error("対象レコードが見つかりません");
      }
      if (existing.isVoided === 1) {
        throw new Error("既に解除済みのレコードです");
      }

      const now = new Date().toISOString();
      await tx.update(leaveUsages).set({
        isVoided: 1,
        voidedAt: now,
        voidedReason: params.voidedReason,
        updatedAt: now,
      }).where(eq(leaveUsages.id, params.leaveUsageId));

      await tx.insert(leaveUsageHistory).values({
        leaveUsageId: params.leaveUsageId,
        action: "voided",
        actedAt: now,
        details: JSON.stringify({
          recordType: existing.recordType,
          days: existing.days,
        }),
        reason: params.voidedReason,
      });

      const updatedRows = await tx.select().from(leaveUsages)
        .where(eq(leaveUsages.id, params.leaveUsageId)).limit(1);
      return updatedRows[0];
    });
  }

  async splitLeaveAdjustment(params: {
    leaveUsageId: number;
    splits: { recordDate: string; days: number }[];
    reason: string;
  }): Promise<LeaveUsage[]> {
    return await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(leaveUsages)
        .where(eq(leaveUsages.id, params.leaveUsageId)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error("対象レコードが見つかりません");
      if (existing.recordType !== "adjustment") throw new Error("補正値レコードのみ分割できます");
      if (existing.isVoided === 1) throw new Error("解除済みレコードは分割できません");
      if (params.splits.length < 2) throw new Error("分割先は2件以上必要です");

      const splitTotal = params.splits.reduce((s, sp) => s + sp.days, 0);
      if (Math.abs(splitTotal - existing.days) > 0.001) {
        throw new Error(`分割後の合計（${splitTotal}）が元の値（${existing.days}）と一致しません`);
      }

      const now = new Date().toISOString();

      await tx.update(leaveUsages).set({
        isVoided: 1,
        voidedAt: now,
        voidedReason: `分割: ${params.reason}`,
        updatedAt: now,
      }).where(eq(leaveUsages.id, params.leaveUsageId));

      await tx.insert(leaveUsageHistory).values({
        leaveUsageId: params.leaveUsageId,
        action: "split",
        actedAt: now,
        details: JSON.stringify({
          originalDays: existing.days,
          splits: params.splits,
        }),
        reason: params.reason,
      });

      const newRecords: LeaveUsage[] = [];
      for (const sp of params.splits) {
        adjustmentDaysSchema.parse(sp.days);
        const rows = await tx.insert(leaveUsages).values({
          employeeId: existing.employeeId,
          startDate: sp.recordDate,
          endDate: sp.recordDate,
          paidLeaveId: existing.paidLeaveId,
          recordDate: sp.recordDate,
          days: sp.days,
          note: `分割元: #${existing.id}`,
          recordType: "adjustment",
          reason: existing.reason,
          isVoided: 0,
          voidedAt: null,
          voidedReason: null,
          createdAt: now,
          updatedAt: now,
        }).returning();
        newRecords.push(rows[0]);
      }
      return newRecords;
    });
  }

  async confirmLeaveAdjustmentDate(params: {
    leaveUsageId: number;
    recordDate: string;
    reason: string;
  }): Promise<LeaveUsage> {
    return await db.transaction(async (tx) => {
      const existingRows = await tx.select().from(leaveUsages)
        .where(eq(leaveUsages.id, params.leaveUsageId)).limit(1);
      const existing = existingRows[0];
      if (!existing) throw new Error("対象レコードが見つかりません");
      if (existing.recordType !== "adjustment") throw new Error("補正値レコードのみ日付確定できます");
      if (existing.isVoided === 1) throw new Error("解除済みレコードは日付確定できません");

      const now = new Date().toISOString();
      const oldDate = existing.recordDate;

      await tx.update(leaveUsages).set({
        recordDate: params.recordDate,
        startDate: params.recordDate,
        endDate: params.recordDate,
        updatedAt: now,
      }).where(eq(leaveUsages.id, params.leaveUsageId));

      await tx.insert(leaveUsageHistory).values({
        leaveUsageId: params.leaveUsageId,
        action: "date_confirmed",
        actedAt: now,
        details: JSON.stringify({
          oldDate,
          newDate: params.recordDate,
        }),
        reason: params.reason,
      });

      const updatedRows = await tx.select().from(leaveUsages)
        .where(eq(leaveUsages.id, params.leaveUsageId)).limit(1);
      return updatedRows[0];
    });
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
        overtimeHours: ot.overtimeHours ?? existing.overtimeHours,
        lateNightOvertime: ot.lateNightOvertime ?? existing.lateNightOvertime,
        holidayWorkLegal: ot.holidayWorkLegal ?? existing.holidayWorkLegal,
        holidayWorkNonLegal: ot.holidayWorkNonLegal ?? existing.holidayWorkNonLegal,
        holidayWorkLegalCount: ot.holidayWorkLegalCount ?? existing.holidayWorkLegalCount,
        holidayWorkNonLegalCount: ot.holidayWorkNonLegalCount ?? existing.holidayWorkNonLegalCount,
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
      holidayWorkLegal: ot.holidayWorkLegal ?? 0,
      holidayWorkNonLegal: ot.holidayWorkNonLegal ?? 0,
      holidayWorkLegalCount: ot.holidayWorkLegalCount ?? 0,
      holidayWorkNonLegalCount: ot.holidayWorkNonLegalCount ?? 0,
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

      const fiscalIndex = (month: number) => (month - 4 + 12) % 12;
      const sortedOT = [...empOT].sort((a, b) => fiscalIndex(a.month) - fiscalIndex(b.month));
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
  async getPaidLeaveAlerts(): Promise<PaidLeaveAlert[]> {
    const alerts: PaidLeaveAlert[] = [];
    const emps = await this.getEmployees(false);
    const leaves = await this.getPaidLeaves();
    const now = new Date();

    const allUsagesForAlerts = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.isVoided, 0));
    const latestLeaveByEmpIdForAlerts = new Map<string, PaidLeave>();
    for (const l of leaves) {
      const existing = latestLeaveByEmpIdForAlerts.get(l.employeeId);
      if (!existing || l.id > existing.id) {
        latestLeaveByEmpIdForAlerts.set(l.employeeId, l);
      }
    }
    const alertUsagesByPaidLeaveId = new Map<number, typeof allUsagesForAlerts>();
    for (const u of allUsagesForAlerts) {
      const key = u.paidLeaveId === 0
        ? (latestLeaveByEmpIdForAlerts.get(u.employeeId)?.id ?? 0)
        : u.paidLeaveId;
      const arr = alertUsagesByPaidLeaveId.get(key) ?? [];
      arr.push(u);
      alertUsagesByPaidLeaveId.set(key, arr);
    }

    for (const emp of emps) {
      const empLeaves = leaves.filter(l => l.employeeId === emp.id);
      if (empLeaves.length === 0) continue;
      const latestLeave = empLeaves.reduce((a, b) => a.id > b.id ? a : b);
      const grantedDays = latestLeave.grantedDays;
      const carriedOverDays = latestLeave.carriedOverDays;

      const usgsForEmp = alertUsagesByPaidLeaveId.get(latestLeave.id) ?? [];
      const consumedDays = calcConsumedDaysFromUsages(usgsForEmp);
      const autoExpired = calcAutoExpiredDays(carriedOverDays, consumedDays);
      const remainingDays = calcRemainingDays({
        grantedDays,
        carriedOverDays,
        consumedDays,
        expiredDays: autoExpired,
      });
      const usageRate = calcUsageRate({
        grantedDays,
        carriedOverDays,
        consumedDays,
      });

      if (remainingDays <= 0) {
        const deadline = calcLeaveDeadline(emp.joinDate, consumedDays, now);
        if (deadline.isObligationTarget && consumedDays < 5) {
          const totalGranted = grantedDays + carriedOverDays;
          const lostDays = totalGranted - consumedDays;
          const carryoverNote = carriedOverDays > 0
            ? `（うち繰越${carriedOverDays}日を含む${totalGranted}日が付与済み）`
            : `（${totalGranted}日が付与済み）`;
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "zero_remaining", severity: "notice",
            message: `残日数0日・年5日義務未達成（${consumedDays}日のみ取得）${carryoverNote}。${lostDays}日分が未取得のまま失効。使用者の時季指定義務違反に該当する可能性があり、労基法第39条第7項に基づき30万円以下の罰金の対象となり得ます`,
            value: consumedDays,
          });
        }
        continue;
      }

      const totalAvailable = grantedDays + carriedOverDays;
      const deadline = calcLeaveDeadline(emp.joinDate, consumedDays, now);

      if (deadline.isObligationTarget && consumedDays < 5) {
        const remaining = deadline.remainingObligation;
        if (deadline.paceStatus === "overdue") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "danger",
            message: `年5日義務の期限超過（${deadline.obligationDeadline}期限、${consumedDays}日のみ取得）`,
            value: consumedDays,
          });
        } else if (deadline.paceStatus === "danger") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "danger",
            message: `期限まで${deadline.daysUntilDeadline}日、あと${remaining}日必要（${deadline.obligationDeadline}まで）`,
            value: consumedDays,
          });
        } else if (deadline.paceStatus === "tight") {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "warning",
            message: `期限まで${deadline.daysUntilDeadline}日、あと${remaining}日必要（${deadline.obligationDeadline}まで）`,
            value: consumedDays,
          });
        } else {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "under_5days", severity: "info",
            message: `年5日義務に対し${consumedDays}日取得（ペース順調・${deadline.obligationDeadline}までにあと${remaining}日）`,
            value: consumedDays,
          });
        }
      }

      if (totalAvailable > 0 && usageRate < 0.3 && consumedDays >= 5) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "low_usage_rate", severity: "warning",
          message: `有給取得率が${(usageRate * 100).toFixed(0)}%（30%未満）。使用者の時季指定義務（労基法39条）に基づき、取得促進が必要`,
          value: usageRate,
        });
      }

      const expiryRisk = calcExpiryRisk(remainingDays, deadline.daysUntilDeadline, deadline.paceStatus);
      const isHighUsageRate = usageRate >= 0.7;
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
        carriedOverDays, consumedDays, remainingDays,
        grantedDays, deadline.daysUntilDeadline
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

      if (autoExpired > 0) {
        if (!isHighUsageRate) {
          const ratePercent = (usageRate * 100).toFixed(0);
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "expired_low_rate", severity: "caution",
            message: `時効消滅${autoExpired}日・取得率${ratePercent}%。休息不足による疲労蓄積リスク（厳労働省・過重労働防止GL）。月1日以上の計画的な取得推奨`,
            value: autoExpired,
          });
        } else {
          alerts.push({
            employeeId: emp.id, employeeName: emp.name,
            type: "expiring_soon", severity: "notice",
            message: `時効消滅が${autoExpired}日発生（取得率${(usageRate * 100).toFixed(0)}%で良好）`,
            value: autoExpired,
          });
        }
      }
      if (expiryRisk.riskLevel === "high" && isHighUsageRate) {
        alerts.push({
          employeeId: emp.id, employeeName: emp.name,
          type: "expiry_risk", severity: "notice",
          message: `取得率${(usageRate * 100).toFixed(0)}%で良好ですが、${expiryRisk.expiryDays}日分が失効見込み`,
          value: expiryRisk.expiryDays,
        });
      }
    }
    return alerts;
  }

  // ── All Alerts Combined ──
  async getAllAlerts(year: number = 2025): Promise<EmployeeAlert[]> {
    const overtimeAlerts = await this.getOvertimeAlerts(year);
    const leaveAlerts = await this.getPaidLeaveAlerts();

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
    const leaves = await this.getPaidLeaves();
    const overtimes = await this.getMonthlyOvertimes(undefined, year);
    const allAlerts = await this.getAllAlerts(year);
    const latestLeaveByEmpId = new Map<string, PaidLeave>();
    for (const l of leaves) {
      const existing = latestLeaveByEmpId.get(l.employeeId);
      if (!existing || l.id > existing.id) {
        latestLeaveByEmpId.set(l.employeeId, l);
      }
    }

    const allUsages = await db.select().from(leaveUsages)
      .where(eq(leaveUsages.isVoided, 0));
    const usagesByPaidLeaveId = new Map<number, typeof allUsages>();
    for (const u of allUsages) {
      const key = u.paidLeaveId === 0
        ? (latestLeaveByEmpId.get(u.employeeId)?.id ?? 0)
        : u.paidLeaveId;
      const arr = usagesByPaidLeaveId.get(key) ?? [];
      arr.push(u);
      usagesByPaidLeaveId.set(key, arr);
    }

    const now = new Date();

    return emps.map(emp => {
      const latestLeave = latestLeaveByEmpId.get(emp.id);
      const hasLeave = !!latestLeave;
      const grantedDays = latestLeave?.grantedDays ?? 0;
      const carriedOverDays = latestLeave?.carriedOverDays ?? 0;
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

      const usgsForSummary = hasLeave ? (usagesByPaidLeaveId.get(latestLeave!.id) ?? []) : [];
      const empConsumedDays = hasLeave ? calcConsumedDaysFromUsages(usgsForSummary) : 0;
      const empAutoExpired = hasLeave ? calcAutoExpiredDays(carriedOverDays, empConsumedDays) : 0;
      const empRemainingDays = hasLeave ? calcRemainingDays({
        grantedDays,
        carriedOverDays,
        consumedDays: empConsumedDays,
        expiredDays: empAutoExpired,
      }) : 0;
      const empUsageRate = hasLeave ? calcUsageRate({
        grantedDays,
        carriedOverDays,
        consumedDays: empConsumedDays,
      }) : 0;

      const deadline = calcLeaveDeadline(emp.joinDate, empConsumedDays, now);
      const expiryRisk = hasLeave ? calcExpiryRisk(empRemainingDays, deadline.daysUntilDeadline, deadline.paceStatus) : null;
      const consumptionPace = hasLeave ? calcConsumptionPace(grantedDays, empConsumedDays, emp.joinDate, now) : null;
      const carryoverUtil = hasLeave ? calcCarryoverUtil(carriedOverDays, empConsumedDays, empRemainingDays, grantedDays, deadline.daysUntilDeadline) : null;

      return {
        id: emp.id, name: emp.name, assignment: emp.assignment, status: emp.status,
        paidLeave: hasLeave ? (() => {
          const usageOnlyTotal = usgsForSummary
            .filter(u => u.recordType === "usage")
            .reduce((s, u) => s + u.days, 0);
          const expired = calcAutoExpiredDays(carriedOverDays, empConsumedDays);
          const expiredAuto = calcAutoExpiredDays(carriedOverDays, usageOnlyTotal);
          const adjustments = usgsForSummary.filter(u => u.recordType === "adjustment");
          return {
            consumedDays: empConsumedDays, remainingDays: Math.max(0, empRemainingDays),
            totalAvailable: grantedDays + carriedOverDays,
            usageRate: empUsageRate, grantedDays,
            carriedOverDays, expiredDays: empAutoExpired,
            adjustedRemainingDays: Math.max(0, grantedDays + carriedOverDays - empConsumedDays - expired),
            autoRemainingDays: Math.max(0, grantedDays + carriedOverDays - usageOnlyTotal - expiredAuto),
            activeAdjustmentCount: adjustments.length,
          };
        })() : null,
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
      };
    });
  }

  // ── Special Leaves ──
  async getSpecialLeaves(employeeId?: string): Promise<SpecialLeave[]> {
    if (employeeId) {
      return await db.select().from(specialLeaves).where(eq(specialLeaves.employeeId, employeeId));
    }
    return await db.select().from(specialLeaves);
  }

  async createSpecialLeave(leave: InsertSpecialLeave): Promise<SpecialLeave> {
    const rows = await db.insert(specialLeaves).values({
      employeeId: leave.employeeId,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days ?? 1,
      leaveType: leave.leaveType ?? "その他",
      reason: leave.reason ?? "",
    }).returning();
    return rows[0];
  }

  async deleteSpecialLeave(id: number): Promise<boolean> {
    const result = await db.delete(specialLeaves).where(eq(specialLeaves.id, id));
    return true;
  }

  // ── Holiday Works ──
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
