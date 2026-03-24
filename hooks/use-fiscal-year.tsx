"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * 日本の年度は4月始まり。現在の年度を計算する。
 * 例: 2026年3月 → 2025年度、2026年4月 → 2026年度
 */
function getCurrentFiscalYear(): number {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const year = now.getFullYear();
  return month >= 4 ? year : year - 1;
}

/** 選択可能な年度一覧（直近5年分） */
function getFiscalYearOptions(): number[] {
  const current = getCurrentFiscalYear();
  const years: number[] = [];
  for (let y = current + 1; y >= current - 3; y--) {
    years.push(y);
  }
  return years;
}

interface FiscalYearContextType {
  fiscalYear: number;
  setFiscalYear: (year: number) => void;
  fiscalYearOptions: number[];
}

const FiscalYearContext = createContext<FiscalYearContextType | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [fiscalYear, setFiscalYear] = useState(getCurrentFiscalYear);
  const fiscalYearOptions = getFiscalYearOptions();

  return (
    <FiscalYearContext.Provider value={{ fiscalYear, setFiscalYear, fiscalYearOptions }}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) throw new Error("useFiscalYear must be used within FiscalYearProvider");
  return ctx;
}
