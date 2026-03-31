import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { z } from "zod";

// ── 社員テーブル ──
export const employees = sqliteTable("employees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  assignment: text("assignment").notNull().default("-"),
  joinDate: text("join_date").notNull().default(""),
  retiredDate: text("retired_date").notNull().default(""),
  status: text("status").notNull().default("active"),
  tenureMonths: integer("tenure_months").notNull().default(0),
  memo: text("memo").notNull().default(""),
});

export const insertEmployeeSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  assignment: z.string().optional(),
  joinDate: z.string().optional(),
  retiredDate: z.string().optional(),
  status: z.string().optional(),
  tenureMonths: z.number().optional(),
  memo: z.string().optional(),
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

// ── 配属履歴テーブル ──
export const assignmentHistories = sqliteTable("assignment_histories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id").notNull(),
  assignment: text("assignment").notNull().default("-"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull().default(""),
  note: text("note").notNull().default(""),
});

export const insertAssignmentHistorySchema = z.object({
  employeeId: z.string(),
  assignment: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  note: z.string().optional(),
});
export type InsertAssignmentHistory = z.infer<typeof insertAssignmentHistorySchema>;
export type AssignmentHistory = typeof assignmentHistories.$inferSelect;

// ── 有給休暇テーブル ──
export const paidLeaves = sqliteTable("paid_leaves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id").notNull(),
  fiscalYear: integer("fiscal_year").notNull().default(2025),
  grantedDays: real("granted_days").notNull().default(0),
  carriedOverDays: real("carried_over_days").notNull().default(0),
  consumedDays: real("consumed_days").notNull().default(0),
  remainingDays: real("remaining_days").notNull().default(0),
  expiredDays: real("expired_days").notNull().default(0),
  usageRate: real("usage_rate").notNull().default(0),
});

export const insertPaidLeaveSchema = z.object({
  employeeId: z.string(),
  fiscalYear: z.number().optional(),
  grantedDays: z.number().optional(),
  carriedOverDays: z.number().optional(),
  consumedDays: z.number().optional(),
  remainingDays: z.number().optional(),
  expiredDays: z.number().optional(),
  usageRate: z.number().optional(),
});
export type InsertPaidLeave = z.infer<typeof insertPaidLeaveSchema>;
export type PaidLeave = typeof paidLeaves.$inferSelect;

// ── 有給使用履歴テーブル ──
export const leaveUsages = sqliteTable("leave_usages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull().default(1),
  reason: text("reason").default(""),
});

export const insertLeaveUsageSchema = z.object({
  employeeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().optional(),
  reason: z.string().nullable().optional(),
});
export type InsertLeaveUsage = z.infer<typeof insertLeaveUsageSchema>;
export type LeaveUsage = typeof leaveUsages.$inferSelect;

// ── 特別休暇テーブル ──
export const specialLeaves = sqliteTable("special_leaves", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  days: real("days").notNull().default(1),
  leaveType: text("leave_type").notNull().default("その他"),
  reason: text("reason").default(""),
});

export const insertSpecialLeaveSchema = z.object({
  employeeId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().optional(),
  leaveType: z.string().optional(),
  reason: z.string().nullable().optional(),
});
export type InsertSpecialLeave = z.infer<typeof insertSpecialLeaveSchema>;
export type SpecialLeave = typeof specialLeaves.$inferSelect;

// ── 月別残業テーブル ──
export const monthlyOvertimes = sqliteTable("monthly_overtimes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: text("employee_id").notNull(),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  overtimeHours: real("overtime_hours").notNull().default(0),
  lateNightOvertime: real("late_night_overtime").notNull().default(0),
  holidayWorkLegal: real("holiday_work_legal").notNull().default(0),
  holidayWorkNonLegal: real("holiday_work_non_legal").notNull().default(0),
  holidayWorkLegalCount: integer("holiday_work_legal_count").notNull().default(0),
  holidayWorkNonLegalCount: integer("holiday_work_non_legal_count").notNull().default(0),
});

export const insertMonthlyOvertimeSchema = z.object({
  employeeId: z.string(),
  year: z.number(),
  holidayWorkLegal: z.number().optional(),
  holidayWorkNonLegal: z.number().optional(),
  holidayWorkLegalCount: z.number().optional(),
  holidayWorkNonLegalCount: z.number().optional(),
  month: z.number(),
  overtimeHours: z.number().optional(),
  lateNightOvertime: z.number().optional(),
});
export type InsertMonthlyOvertime = z.infer<typeof insertMonthlyOvertimeSchema>;
export type MonthlyOvertime = typeof monthlyOvertimes.$inferSelect;

// ── 残業アラート（計算結果、保存用） ──
export type OvertimeAlert = {
  employeeId: string;
  employeeName: string;
  type: "monthly_45h" | "monthly_100h" | "yearly_360h" | "yearly_720h" | "over45_count" | "multi_month_avg";
  severity: "danger" | "warning" | "caution" | "info";
  message: string;
  value: number;
};

// ── 有給アラート（計算結果） ──
export type PaidLeaveAlert = {
  employeeId: string;
  employeeName: string;
  type: "under_5days" | "low_usage_rate" | "expiring_soon" | "expiry_risk" | "carryover_risk" | "zero_remaining" | "expired_low_rate";
  severity: "danger" | "warning" | "caution" | "info" | "notice";
  message: string;
  value: number;
};

// ── 統合アラート型 ──
export type EmployeeAlert = {
  employeeId: string;
  employeeName: string;
  category: "overtime" | "paid_leave";
  type: string;
  severity: "danger" | "warning" | "caution" | "info" | "notice";
  message: string;
  value: number;
};
