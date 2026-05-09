import { z } from "zod";

const EPSILON = 1e-9;

export function isValidEighthIncrement(days: number): boolean {
  if (!Number.isFinite(days)) return false;
  const eighths = days * 8;
  return Math.abs(eighths - Math.round(eighths)) < EPSILON;
}

export const usageDaysSchema = z.number()
  .positive("日数は正の値で入力してください")
  .max(99.999, "日数は99.999日以下で入力してください")
  .refine(isValidEighthIncrement, {
    message: "0.125日刻みで入力してください",
  });

export const adjustmentDaysSchema = z.number()
  .refine((v) => v !== 0, { message: "補正値は0以外の値で入力してください" })
  .refine((v) => Math.abs(v) >= 0.125, { message: "日数は0.125日以上で入力してください" })
  .refine((v) => Math.abs(v) <= 99.999, { message: "日数は99.999日以下で入力してください" })
  .refine(isValidEighthIncrement, {
    message: "0.125日刻みで入力してください",
  });

export const recordDateSchema = z.string()
  .min(1, "日付は必須です")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください");

export const reasonSchema = z.string()
  .min(1, "理由は必須です")
  .refine((v) => v.trim().length > 0, { message: "空白のみの理由は入力できません" })
  .refine((v) => v.length <= 200, { message: "理由は200文字以内で入力してください" });

export const leaveUsageSchema = z.discriminatedUnion("record_type", [
  z.object({
    record_type: z.literal("usage"),
    paid_leave_id: z.number().int().positive(),
    record_date: z.string(),
    days: usageDaysSchema,
    reason: z.string().optional(),
    note: z.string().optional(),
  }),
  z.object({
    record_type: z.literal("adjustment"),
    paid_leave_id: z.number().int().positive(),
    record_date: z.string(),
    days: adjustmentDaysSchema,
    reason: reasonSchema,
    note: z.string().optional(),
  }),
]);

export const voidLeaveUsageSchema = z.object({
  voided_reason: reasonSchema,
});
