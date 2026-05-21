import { describe, test, expect } from "vitest";
import { insertLeaveUsageSchema } from "../schema";

describe("insertLeaveUsageSchema バリデーション", () => {
  const base = { employeeId: "EMP_01", days: 1 };

  test("過去日付が受理される", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2025-01-15" });
    expect(result.success).toBe(true);
  });

  test("当日が受理される", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: today });
    expect(result.success).toBe(true);
  });

  test("未来日付（1年以内）が受理される", () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 6);
    const dateStr = future.toISOString().slice(0, 10);
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: dateStr });
    expect(result.success).toBe(true);
  });

  test("YYYY-MM-DD 形式でない値が弾かれる", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2026/01/01" });
    expect(result.success).toBe(false);
  });

  test("未来1年を超える日付が弾かれる", () => {
    const tooFar = new Date();
    tooFar.setFullYear(tooFar.getFullYear() + 1);
    tooFar.setDate(tooFar.getDate() + 2);
    const dateStr = tooFar.toISOString().slice(0, 10);
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: dateStr });
    expect(result.success).toBe(false);
  });

  test("days が 0 の場合は弾かれる", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2026-01-01", days: 0 });
    expect(result.success).toBe(false);
  });

  test("days が負の値の場合は弾かれる", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2026-01-01", days: -1 });
    expect(result.success).toBe(false);
  });

  test("note は省略可能", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2026-01-01" });
    expect(result.success).toBe(true);
  });

  test("note を指定できる", () => {
    const result = insertLeaveUsageSchema.safeParse({ ...base, recordDate: "2026-01-01", note: "通院のため" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.note).toBe("通院のため");
    }
  });
});
