import { describe, it, expect } from "vitest";
import {
  isValidEighthIncrement,
  usageDaysSchema,
  adjustmentDaysSchema,
  reasonSchema,
  leaveUsageSchema,
  voidLeaveUsageSchema,
} from "../leave-usage";

describe("isValidEighthIncrement", () => {
  const validCases: [number, boolean][] = [
    [0.125, true],
    [0.25, true],
    [0.375, true],
    [0.5, true],
    [0.875, true],
    [1.0, true],
    [1.125, true],
    [5.875, true],
    [10.0, true],
    [0, true],
    [-0.125, true],
    [-1.0, true],
  ];

  const invalidCases: [number, boolean][] = [
    [0.1, false],
    [0.2, false],
    [1.1, false],
  ];

  const specialCases: [number, boolean][] = [
    [NaN, false],
    [Infinity, false],
    [-Infinity, false],
  ];

  it.each([...validCases, ...invalidCases, ...specialCases])(
    "isValidEighthIncrement(%s) === %s",
    (input, expected) => {
      expect(isValidEighthIncrement(input)).toBe(expected);
    },
  );
});

describe("usageDaysSchema", () => {
  it("正の0.125刻みの値を受け入れる", () => {
    expect(usageDaysSchema.parse(0.125)).toBe(0.125);
    expect(usageDaysSchema.parse(1.0)).toBe(1.0);
    expect(usageDaysSchema.parse(5.875)).toBe(5.875);
  });

  it("0を拒否する（正の値でない）", () => {
    expect(() => usageDaysSchema.parse(0)).toThrow();
  });

  it("負の値を拒否する", () => {
    expect(() => usageDaysSchema.parse(-0.125)).toThrow();
  });

  it("0.125刻みでない値を拒否する", () => {
    expect(() => usageDaysSchema.parse(0.1)).toThrow();
  });

  it("99.999を超える値を拒否する", () => {
    expect(() => usageDaysSchema.parse(100)).toThrow();
  });

  it("99.875（99.999以下かつ0.125刻み）を受け入れる", () => {
    expect(usageDaysSchema.parse(99.875)).toBe(99.875);
  });
});

describe("adjustmentDaysSchema", () => {
  it("正の0.125刻みの値を受け入れる", () => {
    expect(adjustmentDaysSchema.parse(0.125)).toBe(0.125);
    expect(adjustmentDaysSchema.parse(1.0)).toBe(1.0);
  });

  it("負の0.125刻みの値を受け入れる", () => {
    expect(adjustmentDaysSchema.parse(-0.125)).toBe(-0.125);
    expect(adjustmentDaysSchema.parse(-1.0)).toBe(-1.0);
  });

  it("0を拒否する", () => {
    expect(() => adjustmentDaysSchema.parse(0)).toThrow();
  });

  it("0.125刻みでない値を拒否する", () => {
    expect(() => adjustmentDaysSchema.parse(0.1)).toThrow();
  });

  it("絶対値が99.999を超える正の値を拒否する", () => {
    expect(() => adjustmentDaysSchema.parse(100)).toThrow();
  });

  it("絶対値が99.999を超える負の値を拒否する", () => {
    expect(() => adjustmentDaysSchema.parse(-100)).toThrow();
  });

  it("絶対値が99.875（99.999以下）の正の値を受け入れる", () => {
    expect(adjustmentDaysSchema.parse(99.875)).toBe(99.875);
  });

  it("絶対値が99.875（99.999以下）の負の値を受け入れる", () => {
    expect(adjustmentDaysSchema.parse(-99.875)).toBe(-99.875);
  });

  it("絶対値が0.125未満を拒否する", () => {
    expect(() => adjustmentDaysSchema.parse(0.0625)).toThrow();
    expect(() => adjustmentDaysSchema.parse(-0.0625)).toThrow();
  });
});

describe("reasonSchema", () => {
  it("通常のテキストを受け入れる", () => {
    expect(reasonSchema.parse("テスト理由")).toBe("テスト理由");
  });

  it("空文字列を拒否する", () => {
    expect(() => reasonSchema.parse("")).toThrow();
  });

  it("空白のみの文字列を拒否する", () => {
    expect(() => reasonSchema.parse("   ")).toThrow();
    expect(() => reasonSchema.parse("\t\n")).toThrow();
  });

  it("200文字以内を受け入れる", () => {
    const text200 = "あ".repeat(200);
    expect(reasonSchema.parse(text200)).toBe(text200);
  });

  it("201文字以上を拒否する", () => {
    const text201 = "あ".repeat(201);
    expect(() => reasonSchema.parse(text201)).toThrow();
  });
});

describe("leaveUsageSchema", () => {
  it("usage タイプの有効なデータを受け入れる", () => {
    const data = {
      record_type: "usage" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: 1.0,
    };
    expect(() => leaveUsageSchema.parse(data)).not.toThrow();
  });

  it("adjustment タイプの有効なデータを受け入れる", () => {
    const data = {
      record_type: "adjustment" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: -0.5,
      reason: "マイグレーション初期値",
    };
    expect(() => leaveUsageSchema.parse(data)).not.toThrow();
  });

  it("adjustment で reason が空の場合を拒否する", () => {
    const data = {
      record_type: "adjustment" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: -0.5,
      reason: "",
    };
    expect(() => leaveUsageSchema.parse(data)).toThrow();
  });

  it("adjustment で reason がない場合を拒否する", () => {
    const data = {
      record_type: "adjustment" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: -0.5,
    };
    expect(() => leaveUsageSchema.parse(data)).toThrow();
  });

  it("usage で days が 0 の場合を拒否する", () => {
    const data = {
      record_type: "usage" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: 0,
    };
    expect(() => leaveUsageSchema.parse(data)).toThrow();
  });

  it("adjustment で days が 0 の場合を拒否する", () => {
    const data = {
      record_type: "adjustment" as const,
      paid_leave_id: 1,
      record_date: "2026-05-01",
      days: 0,
      reason: "テスト",
    };
    expect(() => leaveUsageSchema.parse(data)).toThrow();
  });
});

describe("voidLeaveUsageSchema", () => {
  it("有効な解除理由を受け入れる", () => {
    expect(() =>
      voidLeaveUsageSchema.parse({ voided_reason: "入力ミスのため取消" }),
    ).not.toThrow();
  });

  it("空の解除理由を拒否する", () => {
    expect(() => voidLeaveUsageSchema.parse({ voided_reason: "" })).toThrow();
  });

  it("解除理由がない場合を拒否する", () => {
    expect(() => voidLeaveUsageSchema.parse({})).toThrow();
  });

  it("空白のみの解除理由を拒否する", () => {
    expect(() =>
      voidLeaveUsageSchema.parse({ voided_reason: "   " }),
    ).toThrow();
  });

  it("201文字以上の解除理由を拒否する", () => {
    expect(() =>
      voidLeaveUsageSchema.parse({ voided_reason: "あ".repeat(201) }),
    ).toThrow();
  });
});
