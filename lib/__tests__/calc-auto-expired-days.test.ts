import { describe, it, expect } from "vitest";
import { calcAutoExpiredDays } from "../leave-calc";

describe("calcAutoExpiredDays", () => {
  it("繰越0日なら時効0日", () => {
    expect(calcAutoExpiredDays(0, 5)).toBe(0);
  });

  it("繰越が負値なら時効0日", () => {
    expect(calcAutoExpiredDays(-3, 5)).toBe(0);
  });

  it("消化が繰越以上なら時効0日（全部消化済み）", () => {
    expect(calcAutoExpiredDays(10, 10)).toBe(0);
    expect(calcAutoExpiredDays(10, 15)).toBe(0);
  });

  it("消化0日なら繰越全額が時効", () => {
    expect(calcAutoExpiredDays(20, 0)).toBe(20);
  });

  it("一部消化で残りが時効", () => {
    expect(calcAutoExpiredDays(20, 5)).toBe(15);
    expect(calcAutoExpiredDays(20, 2)).toBe(18);
  });

  it("消化が負値（マイナス補正）でも時効は繰越日数を超えない", () => {
    expect(calcAutoExpiredDays(20, -2)).toBe(20);
    expect(calcAutoExpiredDays(20, -10)).toBe(20);
    expect(calcAutoExpiredDays(5, -100)).toBe(5);
  });

  it("小数値の精度が保たれる", () => {
    expect(calcAutoExpiredDays(5.5, 2.5)).toBe(3);
    expect(calcAutoExpiredDays(10, 0.125)).toBe(9.875);
  });
});
