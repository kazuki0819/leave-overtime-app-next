import { describe, it, expect } from "vitest";
import {
  getCurrentCycleStart,
  getCurrentCycleRange,
  getAllCycles,
  getCycleByIndex,
  getCycleIndexForGrantDate,
  type CycleRange,
} from "../leave-calc";

describe("getCurrentCycleStart", () => {
  it("入社6ヶ月後の初回サイクル開始日を返す", () => {
    const result = getCurrentCycleStart("2020-04-01", new Date("2020-11-01"));
    expect(result).toBe("2020-10-01");
  });

  it("2回目以降のサイクル開始日を返す", () => {
    const result = getCurrentCycleStart("2020-04-01", new Date("2022-01-15"));
    expect(result).toBe("2021-10-01");
  });

  it("入社6ヶ月前は初回付与日を返す", () => {
    const result = getCurrentCycleStart("2024-04-01", new Date("2024-06-01"));
    expect(result).toBe("2024-10-01");
  });
});

describe("getCurrentCycleRange", () => {
  it("初回サイクルの範囲を返す", () => {
    const range = getCurrentCycleRange("2020-04-01", new Date("2020-11-01"));
    expect(range).toEqual({
      startDate: "2020-10-01",
      endDate: "2021-10-01",
      index: 0,
    });
  });

  it("3回目のサイクル範囲を返す", () => {
    const range = getCurrentCycleRange("2020-04-01", new Date("2023-05-01"));
    expect(range).toEqual({
      startDate: "2022-10-01",
      endDate: "2023-10-01",
      index: 2,
    });
  });

  it("入社前のサイクル（付与前）は初回付与日ベースの範囲を返す", () => {
    const range = getCurrentCycleRange("2025-01-15", new Date("2025-03-01"));
    expect(range).toEqual({
      startDate: "2025-07-15",
      endDate: "2026-07-15",
      index: 0,
    });
  });
});

describe("getAllCycles", () => {
  it("入社から今日までの全サイクルを返す", () => {
    const cycles = getAllCycles("2020-04-01", new Date("2023-05-01"));
    expect(cycles).toHaveLength(3);
    expect(cycles[0]).toEqual({ startDate: "2020-10-01", endDate: "2021-10-01", index: 0 });
    expect(cycles[1]).toEqual({ startDate: "2021-10-01", endDate: "2022-10-01", index: 1 });
    expect(cycles[2]).toEqual({ startDate: "2022-10-01", endDate: "2023-10-01", index: 2 });
  });

  it("付与前は空配列を返す", () => {
    const cycles = getAllCycles("2025-01-15", new Date("2025-03-01"));
    expect(cycles).toHaveLength(0);
  });

  it("初回付与日ちょうどは1件を返す", () => {
    const cycles = getAllCycles("2020-04-01", new Date("2020-10-01"));
    expect(cycles).toHaveLength(1);
    expect(cycles[0].startDate).toBe("2020-10-01");
  });
});

describe("getCycleByIndex", () => {
  it("index 0 は初回サイクルを返す", () => {
    const cycle = getCycleByIndex("2020-04-01", 0);
    expect(cycle).toEqual({
      startDate: "2020-10-01",
      endDate: "2021-10-01",
      index: 0,
    });
  });

  it("index 3 は4回目のサイクルを返す", () => {
    const cycle = getCycleByIndex("2020-04-01", 3);
    expect(cycle).toEqual({
      startDate: "2023-10-01",
      endDate: "2024-10-01",
      index: 3,
    });
  });

  it("不正な入社日の場合 undefined を返す", () => {
    expect(getCycleByIndex("", 0)).toBeUndefined();
    expect(getCycleByIndex("invalid-date", 0)).toBeUndefined();
  });
});

describe("getCycleIndexForGrantDate", () => {
  it("初回付与日はindex 0を返す", () => {
    expect(getCycleIndexForGrantDate("2020-04-01", "2020-10-01")).toBe(0);
  });

  it("2回目の付与日はindex 1を返す", () => {
    expect(getCycleIndexForGrantDate("2020-04-01", "2021-10-01")).toBe(1);
  });

  it("一致しない日付は0を返す", () => {
    expect(getCycleIndexForGrantDate("2020-04-01", "2020-12-01")).toBe(0);
  });
});
