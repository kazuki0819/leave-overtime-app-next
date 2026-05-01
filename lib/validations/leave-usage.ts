import { z } from "zod";

const EPSILON = 1e-9;

export function isValidEighthIncrement(days: number): boolean {
  if (!Number.isFinite(days)) return false;
  const eighths = days * 8;
  return Math.abs(eighths - Math.round(eighths)) < EPSILON;
}

export const usageDaysSchema = z.number()
  .positive("日数は正の値で入力してください")
  .refine(isValidEighthIncrement, {
    message: "日数は0.125刻みで入力してください",
  });

export const adjustmentDaysSchema = z.number()
  .refine((v) => v !== 0, { message: "補正値は0以外の値で入力してください" })
  .refine(isValidEighthIncrement, {
    message: "日数は0.125刻みで入力してください",
  });

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
    reason: z.string().min(1, "補正理由は必須です"),
    note: z.string().optional(),
  }),
]);

export const voidLeaveUsageSchema = z.object({
  voided_reason: z.string().min(1, "解除理由は必須です"),
});
