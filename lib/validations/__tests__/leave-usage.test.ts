import { describe, it, expect } from "vitest";
import {
  isValidEighthIncrement,
  usageDaysSchema,
  adjustmentDaysSchema,
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
});
