import { describe, it, expect } from "vitest";
import { getCycleByIndex } from "../../leave-calc";

describe("getCycleByIndex (サイクル範囲計算)", () => {
  const joinDate = "2020-04-01";

  it("index=0 で初回サイクル（入社6ヶ月後〜1年間）を返す", () => {
    const cycle = getCycleByIndex(joinDate, 0);
    expect(cycle).toBeDefined();
    expect(cycle!.startDate).toBe("2020-10-01");
    expect(cycle!.endDate).toBe("2021-09-30");
    expect(cycle!.index).toBe(0);
  });

  it("index=1 で2番目のサイクルを返す", () => {
    const cycle = getCycleByIndex(joinDate, 1);
    expect(cycle).toBeDefined();
    expect(cycle!.startDate).toBe("2021-10-01");
    expect(cycle!.endDate).toBe("2022-09-30");
    expect(cycle!.index).toBe(1);
  });

  it("index=5 で6番目のサイクルを返す", () => {
    const cycle = getCycleByIndex(joinDate, 5);
    expect(cycle).toBeDefined();
    expect(cycle!.startDate).toBe("2025-10-01");
    expect(cycle!.endDate).toBe("2026-09-30");
    expect(cycle!.index).toBe(5);
  });

  it("サイクル開始日と終了日は連続する（gap なし）", () => {
    const cycle0 = getCycleByIndex(joinDate, 0);
    const cycle1 = getCycleByIndex(joinDate, 1);
    expect(cycle0).toBeDefined();
    expect(cycle1).toBeDefined();
    const endDate = new Date(cycle0!.endDate);
    const nextStart = new Date(cycle1!.startDate);
    const diffMs = nextStart.getTime() - endDate.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    expect(diffDays).toBe(1);
  });

  it("不正な入社日では undefined を返す", () => {
    expect(getCycleByIndex("", 0)).toBeUndefined();
    expect(getCycleByIndex("invalid", 0)).toBeUndefined();
  });

  it("record_date がサイクル範囲内かの判定ロジック", () => {
    const cycle = getCycleByIndex(joinDate, 0)!;
    expect("2020-10-01" >= cycle.startDate && "2020-10-01" <= cycle.endDate).toBe(true);
    expect("2021-09-30" >= cycle.startDate && "2021-09-30" <= cycle.endDate).toBe(true);
    expect("2020-09-30" >= cycle.startDate && "2020-09-30" <= cycle.endDate).toBe(false);
    expect("2021-10-01" >= cycle.startDate && "2021-10-01" <= cycle.endDate).toBe(false);
  });
});
