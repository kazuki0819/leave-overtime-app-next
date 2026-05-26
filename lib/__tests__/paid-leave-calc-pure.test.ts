import { describe, test, expect } from "vitest";
import {
  calculateGrantedDays,
  calculateCycleStartDate,
  calculateCycleEndDate,
  calculateExpiredDays,
  calculateCarriedOverDays,
  isEndOfMonthAugustHire,
  formatISODate,
} from "../paid-leave-calc";

describe("calculateGrantedDays", () => {
  const dummyJoinDate = new Date("2024-04-01");

  test("cycleNumber=0 は常に0", () => {
    expect(calculateGrantedDays(dummyJoinDate, 0)).toBe(0);
    expect(calculateGrantedDays(dummyJoinDate, 0, true)).toBe(0);
  });

  test("対象外フラグ true は cycleNumber>=1 でも 0", () => {
    expect(calculateGrantedDays(dummyJoinDate, 1, true)).toBe(0);
    expect(calculateGrantedDays(dummyJoinDate, 5, true)).toBe(0);
  });

  test("通常付与: 第1〜第7サイクル", () => {
    expect(calculateGrantedDays(dummyJoinDate, 1)).toBe(10);
    expect(calculateGrantedDays(dummyJoinDate, 2)).toBe(11);
    expect(calculateGrantedDays(dummyJoinDate, 3)).toBe(12);
    expect(calculateGrantedDays(dummyJoinDate, 4)).toBe(14);
    expect(calculateGrantedDays(dummyJoinDate, 5)).toBe(16);
    expect(calculateGrantedDays(dummyJoinDate, 6)).toBe(18);
    expect(calculateGrantedDays(dummyJoinDate, 7)).toBe(20);
  });

  test("第8サイクル以降は20で固定", () => {
    expect(calculateGrantedDays(dummyJoinDate, 10)).toBe(20);
    expect(calculateGrantedDays(dummyJoinDate, 100)).toBe(20);
  });
});

describe("isEndOfMonthAugustHire", () => {
  test("8月28〜31日は true", () => {
    expect(isEndOfMonthAugustHire(new Date("2024-08-28"))).toBe(true);
    expect(isEndOfMonthAugustHire(new Date("2024-08-29"))).toBe(true);
    expect(isEndOfMonthAugustHire(new Date("2024-08-30"))).toBe(true);
    expect(isEndOfMonthAugustHire(new Date("2024-08-31"))).toBe(true);
  });

  test("8月27日以前、9月以降は false", () => {
    expect(isEndOfMonthAugustHire(new Date("2024-08-27"))).toBe(false);
    expect(isEndOfMonthAugustHire(new Date("2024-09-01"))).toBe(false);
    expect(isEndOfMonthAugustHire(new Date("2024-07-31"))).toBe(false);
  });
});

describe("calculateCycleStartDate", () => {
  test("通常: 入社2024/04/01", () => {
    const hire = new Date("2024-04-01");
    expect(formatISODate(calculateCycleStartDate(hire, 0))).toBe("2024-04-01");
    expect(formatISODate(calculateCycleStartDate(hire, 1))).toBe("2024-10-01");
    expect(formatISODate(calculateCycleStartDate(hire, 2))).toBe("2025-10-01");
  });

  test("8月特別ロジック: 8/28〜8/31入社", () => {
    expect(formatISODate(calculateCycleStartDate(new Date("2024-08-28"), 1))).toBe("2025-02-28");
    expect(formatISODate(calculateCycleStartDate(new Date("2024-08-31"), 1))).toBe("2025-02-28");
    expect(formatISODate(calculateCycleStartDate(new Date("2024-08-31"), 2))).toBe("2026-02-28");
  });

  test("8月27日入社は通常ロジック", () => {
    expect(formatISODate(calculateCycleStartDate(new Date("2024-08-27"), 1))).toBe("2025-02-27");
  });

  test("うるう日入社", () => {
    expect(formatISODate(calculateCycleStartDate(new Date("2024-02-29"), 1))).toBe("2024-08-29");
  });

  test("月末ロールオーバー", () => {
    expect(formatISODate(calculateCycleStartDate(new Date("2024-03-31"), 1))).toBe("2024-09-30");
  });
});

describe("calculateCycleEndDate", () => {
  test("通常入社", () => {
    const hire = new Date("2024-04-01");
    expect(formatISODate(calculateCycleEndDate(hire, 0))).toBe("2024-09-30");
    expect(formatISODate(calculateCycleEndDate(hire, 1))).toBe("2025-09-30");
  });

  test("8月特別ロジック", () => {
    expect(formatISODate(calculateCycleEndDate(new Date("2024-08-31"), 1))).toBe("2026-02-27");
  });
});

describe("calculateExpiredDays", () => {
  test("通常パターン", () => {
    expect(calculateExpiredDays(10, 3)).toBe(7);
  });

  test("消化が付与を超過(マイナスにならない)", () => {
    expect(calculateExpiredDays(10, 15)).toBe(0);
  });

  test("前々サイクルなし", () => {
    expect(calculateExpiredDays(0, 0)).toBe(0);
  });
});

describe("calculateCarriedOverDays", () => {
  test("通常パターン", () => {
    expect(calculateCarriedOverDays(13, 2)).toBe(11);
  });

  test("時効が前残を超過(マイナスにならない)", () => {
    expect(calculateCarriedOverDays(5, 10)).toBe(0);
  });
});

