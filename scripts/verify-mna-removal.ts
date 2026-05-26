import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../lib/schema";
import { eq, asc } from "drizzle-orm";
import { addMonths, addYears, subDays } from "date-fns";

const url = process.env.TURSO_DATABASE_URL!;
const authToken = process.env.TURSO_AUTH_TOKEN!;
const client = createClient({ url, authToken });
const db = drizzle(client, { schema });

const TARGET_IDS = ["67", "1", "5"];
const TODAY = new Date("2026-05-27");

function formatISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isEndOfMonthAugustHire(joinDate: Date): boolean {
  const month = joinDate.getMonth() + 1;
  const day = joinDate.getDate();
  return month === 8 && day >= 28 && day <= 31;
}

function calculateCycleStartDate(joinDate: Date, cycleNumber: number): Date {
  if (cycleNumber === 0) return new Date(joinDate);
  if (isEndOfMonthAugustHire(joinDate)) {
    const baseYear = joinDate.getFullYear() + 1;
    const baseDate = new Date(baseYear, 1, 28);
    return addYears(baseDate, cycleNumber - 1);
  }
  const firstCycleStart = addMonths(joinDate, 6);
  return addYears(firstCycleStart, cycleNumber - 1);
}

function calculateCycleEndDate(joinDate: Date, cycleNumber: number): Date {
  const nextStart = calculateCycleStartDate(joinDate, cycleNumber + 1);
  return subDays(nextStart, 1);
}

function calculateGrantedDays(joinDate: Date, cycleNumber: number): number {
  if (cycleNumber === 0) return 0;
  const grantTable: Record<number, number> = { 1: 10, 2: 11, 3: 12, 4: 14, 5: 16, 6: 18 };
  return grantTable[cycleNumber] ?? 20;
}

function calculateExpiredDays(twoCyclesBackGranted: number, cumulativeUsageFromTwoBack: number): number {
  return Math.max(0, twoCyclesBackGranted - cumulativeUsageFromTwoBack);
}

function calculateCarriedOverDays(previousFinalRemaining: number, expiredAmount: number): number {
  return Math.max(0, previousFinalRemaining - expiredAmount);
}

// M&A path helper (from main branch, before deletion)
function calculateMAndACycleStart(baselineDate: Date, cycleNumber: number): Date {
  if (cycleNumber === 1) return new Date(baselineDate);
  return addYears(baselineDate, cycleNumber - 1);
}

interface CycleResult {
  cycleNumber: number;
  cycleStartDate: string;
  cycleEndDate: string;
  granted: number;
  carry: number;
  baseline: number;
  current: number;
}

// main branch logic (with M&A path) — for non-M&A employees, only the else branch runs
function computeMain(
  joinDate: Date,
  isMAndA: boolean,
  baselineDate: Date | null,
  baselineRemainingDays: number | null,
  usagesOnly: { recordDate: string; days: number }[],
  usagesAndAdj: { recordDate: string; days: number }[],
  today: Date
): CycleResult[] {
  let maxCycleNumber = 0;
  if (isMAndA) {
    let n = 1;
    while (calculateMAndACycleStart(baselineDate!, n) <= today) { maxCycleNumber = n; n++; if (n > 100) break; }
  } else {
    let n = 0;
    while (calculateCycleStartDate(joinDate, n) <= today) { maxCycleNumber = n; n++; if (n > 100) break; }
  }

  const results: CycleResult[] = [];
  let previousFinalRemaining = 0;
  let previousGrantedDays = 0;
  let twoCyclesBackGranted = 0;
  let twoCyclesBackStart: Date | null = null;
  const startCycle = isMAndA ? 1 : 0;

  for (let cycleNumber = startCycle; cycleNumber <= maxCycleNumber; cycleNumber++) {
    let cycleStart: Date, cycleEnd: Date, granted: number, carry: number;

    if (isMAndA) {
      cycleStart = calculateMAndACycleStart(baselineDate!, cycleNumber);
      cycleEnd = subDays(calculateMAndACycleStart(baselineDate!, cycleNumber + 1), 1);
      if (cycleNumber === 1) { granted = 0; carry = baselineRemainingDays!; }
      else if (cycleNumber === 2) { granted = calculateGrantedDays(joinDate, cycleNumber); carry = calculateCarriedOverDays(previousFinalRemaining, 0); }
      else if (cycleNumber === 3) {
        granted = calculateGrantedDays(joinDate, cycleNumber);
        const cum = usagesOnly.filter(u => new Date(u.recordDate) >= baselineDate!).reduce((s, u) => s + u.days, 0);
        const expired = Math.max(0, baselineRemainingDays! - cum);
        carry = calculateCarriedOverDays(previousFinalRemaining, expired);
      } else {
        granted = calculateGrantedDays(joinDate, cycleNumber);
        const cum = twoCyclesBackStart ? usagesOnly.filter(u => new Date(u.recordDate) >= twoCyclesBackStart!).reduce((s, u) => s + u.days, 0) : 0;
        const expired = calculateExpiredDays(twoCyclesBackGranted, cum);
        carry = calculateCarriedOverDays(previousFinalRemaining, expired);
      }
    } else {
      cycleStart = calculateCycleStartDate(joinDate, cycleNumber);
      cycleEnd = calculateCycleEndDate(joinDate, cycleNumber);
      granted = calculateGrantedDays(joinDate, cycleNumber);
      if (cycleNumber === 0 || cycleNumber === 1) { carry = 0; }
      else {
        const cum = twoCyclesBackStart ? usagesOnly.filter(u => new Date(u.recordDate) >= twoCyclesBackStart!).reduce((s, u) => s + u.days, 0) : 0;
        const expired = calculateExpiredDays(twoCyclesBackGranted, cum);
        carry = calculateCarriedOverDays(previousFinalRemaining, expired);
      }
    }

    const baseline = granted + carry;
    const csStr = formatISODate(cycleStart);
    const ceStr = formatISODate(cycleEnd);
    const usage = usagesAndAdj.filter(u => u.recordDate >= csStr && u.recordDate <= ceStr).reduce((s, u) => s + u.days, 0);
    const current = Math.max(0, baseline - usage);
    const isInProgress = cycleStart <= today && today <= cycleEnd;
    const final = isInProgress ? null : current;

    results.push({ cycleNumber, cycleStartDate: csStr, cycleEndDate: ceStr, granted, carry, baseline, current });

    twoCyclesBackGranted = previousGrantedDays;
    twoCyclesBackStart = cycleNumber >= 1
      ? (isMAndA ? calculateMAndACycleStart(baselineDate!, cycleNumber - 1) : calculateCycleStartDate(joinDate, cycleNumber - 1))
      : null;
    previousGrantedDays = granted;
    previousFinalRemaining = isInProgress ? current : final!;
  }
  return results;
}

// new branch logic (M&A path removed)
function computeNew(
  joinDate: Date,
  usagesOnly: { recordDate: string; days: number }[],
  usagesAndAdj: { recordDate: string; days: number }[],
  today: Date
): CycleResult[] {
  let maxCycleNumber = 0;
  { let n = 0; while (calculateCycleStartDate(joinDate, n) <= today) { maxCycleNumber = n; n++; if (n > 100) break; } }

  const results: CycleResult[] = [];
  let previousFinalRemaining = 0;
  let previousGrantedDays = 0;
  let twoCyclesBackGranted = 0;
  let twoCyclesBackStart: Date | null = null;

  for (let cycleNumber = 0; cycleNumber <= maxCycleNumber; cycleNumber++) {
    const cycleStart = calculateCycleStartDate(joinDate, cycleNumber);
    const cycleEnd = calculateCycleEndDate(joinDate, cycleNumber);
    const granted = calculateGrantedDays(joinDate, cycleNumber);

    let carry: number;
    if (cycleNumber === 0 || cycleNumber === 1) { carry = 0; }
    else {
      const cum = twoCyclesBackStart ? usagesOnly.filter(u => new Date(u.recordDate) >= twoCyclesBackStart!).reduce((s, u) => s + u.days, 0) : 0;
      const expired = calculateExpiredDays(twoCyclesBackGranted, cum);
      carry = calculateCarriedOverDays(previousFinalRemaining, expired);
    }

    const baseline = granted + carry;
    const csStr = formatISODate(cycleStart);
    const ceStr = formatISODate(cycleEnd);
    const usage = usagesAndAdj.filter(u => u.recordDate >= csStr && u.recordDate <= ceStr).reduce((s, u) => s + u.days, 0);
    const current = Math.max(0, baseline - usage);
    const isInProgress = cycleStart <= today && today <= cycleEnd;
    const final = isInProgress ? null : current;

    results.push({ cycleNumber, cycleStartDate: csStr, cycleEndDate: ceStr, granted, carry, baseline, current });

    twoCyclesBackGranted = previousGrantedDays;
    twoCyclesBackStart = cycleNumber >= 1 ? calculateCycleStartDate(joinDate, cycleNumber - 1) : null;
    previousGrantedDays = granted;
    previousFinalRemaining = isInProgress ? current : final!;
  }
  return results;
}

async function main() {
  let allPassed = true;

  for (const empId of TARGET_IDS) {
    const empRows = await db.select().from(schema.employees).where(eq(schema.employees.id, empId)).limit(1);
    const emp = empRows[0];
    if (!emp) { console.log(`Employee ${empId} not found, skipping`); continue; }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Employee: ${emp.name} (id=${emp.id})`);
    console.log(`  joinDate=${emp.joinDate}, baselineDate=${emp.baselineDate}, baselineRemainingDays=${emp.baselineRemainingDays}`);

    if (emp.baselineDate !== null) {
      console.log(`  *** SKIPPING: M&A employee ***`);
      continue;
    }

    const allUsages = await db.select().from(schema.leaveUsages)
      .where(eq(schema.leaveUsages.employeeId, empId))
      .orderBy(asc(schema.leaveUsages.recordDate));

    const usagesOnlyClean = allUsages
      .filter(u => u.isVoided === 0 && u.recordType === "usage")
      .map(u => ({ recordDate: u.recordDate, days: u.days }));

    const usagesAndAdjClean = allUsages
      .filter(u => u.isVoided === 0 && (u.recordType === "usage" || u.recordType === "adjustment"))
      .map(u => ({ recordDate: u.recordDate, days: u.days }));

    const joinDate = new Date(emp.joinDate!);

    const oldResult = computeMain(joinDate, false, null, null, usagesOnlyClean, usagesAndAdjClean, TODAY);
    const newResult = computeNew(joinDate, usagesOnlyClean, usagesAndAdjClean, TODAY);

    console.log(`  Old (main) cycles: ${oldResult.length}, New (refactored) cycles: ${newResult.length}`);

    if (oldResult.length !== newResult.length) {
      console.log(`  *** CYCLE COUNT MISMATCH ***`);
      allPassed = false;
      continue;
    }

    let empMatch = true;
    for (let i = 0; i < oldResult.length; i++) {
      const o = oldResult[i];
      const n = newResult[i];
      const fields: [string, any, any][] = [
        ["cycleNumber", o.cycleNumber, n.cycleNumber],
        ["cycleStartDate", o.cycleStartDate, n.cycleStartDate],
        ["cycleEndDate", o.cycleEndDate, n.cycleEndDate],
        ["granted", o.granted, n.granted],
        ["carry", o.carry, n.carry],
        ["baseline", o.baseline, n.baseline],
        ["current", o.current, n.current],
      ];

      const mismatches = fields.filter(([, a, b]) => String(a) !== String(b));
      if (mismatches.length > 0) {
        console.log(`  Cycle ${o.cycleNumber} (${o.cycleStartDate}): MISMATCH`);
        for (const [name, oldVal, newVal] of mismatches) {
          console.log(`    ${name}: old=${oldVal} new=${newVal}`);
        }
        empMatch = false;
      } else {
        console.log(`  Cycle ${o.cycleNumber} (${o.cycleStartDate}): MATCH  granted=${o.granted} carry=${o.carry} baseline=${o.baseline} current=${o.current}`);
      }
    }

    if (empMatch) {
      console.log(`  >>> ALL CYCLES MATCH <<<`);
    } else {
      console.log(`  >>> MISMATCH DETECTED <<<`);
      allPassed = false;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(allPassed ? "RESULT: ALL EMPLOYEES MATCH — M&A path removal is safe for non-M&A employees" : "RESULT: MISMATCH FOUND — investigate");
}

main().catch(console.error);
