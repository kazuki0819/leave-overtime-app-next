/**
 * 有給休暇の付与基準日・法定付与日数・年5日義務期限を計算するユーティリティ
 * 
 * 労働基準法に基づく:
 * - 入社6ヶ月後に初回付与（10日）
 * - 以降1年ごとに付与（11→12→14→16→18→20日）
 * - 6.5年以降は毎年20日
 * - 付与日から1年以内に5日取得が義務（年次有給休暇の時季指定義務）
 */

// 法定付与テーブル: 勤続年数 → 付与日数
const LEGAL_GRANT_TABLE: [number, number][] = [
  [0.5, 10],  // 6ヶ月
  [1.5, 11],  // 1年6ヶ月
  [2.5, 12],  // 2年6ヶ月
  [3.5, 14],  // 3年6ヶ月
  [4.5, 16],  // 4年6ヶ月
  [5.5, 18],  // 5年6ヶ月
  [6.5, 20],  // 6年6ヶ月以降
];

export type LeaveDeadlineInfo = {
  /** 入社日 */
  joinDate: string;
  /** 現在の付与基準日（直近の付与日） */
  currentGrantDate: string;
  /** 年5日義務の期限日（付与基準日 + 1年） */
  obligationDeadline: string;
  /** 期限までの残り日数 */
  daysUntilDeadline: number;
  /** 法定付与日数 */
  legalGrantDays: number;
  /** 勤続年数 */
  tenureYears: number;
  /** あと何日取得が必要か（5日義務に対して） */
  remainingObligation: number;
  /** 期限に対する余裕度: "ok" | "tight" | "danger" | "overdue" */
  paceStatus: "ok" | "tight" | "danger" | "overdue" | "not_eligible";
  /** 余裕度の説明 */
  paceMessage: string;
  /** 5日義務の対象かどうか（付与日数10日以上が条件） */
  isObligationTarget: boolean;
};

/** 有給失効リスク情報 */
export type ExpiryRiskInfo = {
  /** 失効見込み日数 */
  expiryDays: number;
  /** 期限までの残り営業日数（推定） */
  workdaysRemaining: number;
  /** リスクレベル */
  riskLevel: "none" | "low" | "medium" | "high";
  /** 説明 */
  message: string;
};

/** 取得ペース情報 */
export type ConsumptionPaceInfo = {
  /** 付与日数を均等消化する場合の月あたり理想ペース */
  idealMonthlyPace: number;
  /** 実績の月あたり消化ペース */
  actualMonthlyPace: number;
  /** ペース比率（actual/ideal, 1.0が理想） */
  paceRatio: number;
  /** ペース評価 */
  paceLevel: "good" | "slow" | "very_slow" | "not_applicable";
  /** 説明 */
  message: string;
};

/** 繰越活用度情報 */
export type CarryoverUtilInfo = {
  /** 繰越日数 */
  carriedOverDays: number;
  /** 繰越分のうち消化見込みがない日数（推定） */
  unusedCarryover: number;
  /** 活用度レベル */
  utilLevel: "good" | "warning" | "danger" | "not_applicable";
  /** 説明 */
  message: string;
};

/**
 * 入社日に月数を加算する
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 入社日に年数を加算する
 */
function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * 2つの日付間の日数を計算
 */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

/**
 * Date → "YYYY-MM-DD"
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 勤続年数から法定付与日数を算出
 */
export function getLegalGrantDays(tenureYears: number): number {
  let days = 0;
  for (const [years, grantDays] of LEGAL_GRANT_TABLE) {
    if (tenureYears >= years) {
      days = grantDays;
    } else {
      break;
    }
  }
  return days;
}

/**
 * 入社日と現在日から、付与基準日・義務期限・余裕度を計算する
 */
export function calcLeaveDeadline(
  joinDateStr: string,
  consumedDays: number,
  today?: Date
): LeaveDeadlineInfo {
  const now = today ?? new Date();
  const joinDate = new Date(joinDateStr);
  
  // 入社日が不正な場合
  if (isNaN(joinDate.getTime()) || !joinDateStr) {
    return {
      joinDate: joinDateStr || "",
      currentGrantDate: "",
      obligationDeadline: "",
      daysUntilDeadline: 0,
      legalGrantDays: 0,
      tenureYears: 0,
      remainingObligation: 0,
      paceStatus: "not_eligible",
      paceMessage: "入社日データなし",
      isObligationTarget: false,
    };
  }
  
  // 勤続年数を計算
  const tenureMs = now.getTime() - joinDate.getTime();
  const tenureYears = tenureMs / (365.25 * 24 * 60 * 60 * 1000);
  
  // まだ6ヶ月未満の場合
  const firstGrantDate = addMonths(joinDate, 6);
  if (now < firstGrantDate) {
    return {
      joinDate: joinDateStr,
      currentGrantDate: formatDate(firstGrantDate),
      obligationDeadline: formatDate(addYears(firstGrantDate, 1)),
      daysUntilDeadline: daysBetween(now, firstGrantDate),
      legalGrantDays: 10,
      tenureYears: Math.round(tenureYears * 10) / 10,
      remainingObligation: 5,
      paceStatus: "not_eligible",
      paceMessage: `初回付与まで${daysBetween(now, firstGrantDate)}日（${formatDate(firstGrantDate)}）`,
      isObligationTarget: false,
    };
  }
  
  // 直近の付与基準日を特定する
  // 最初の付与: 入社日 + 6ヶ月
  // 2回目以降: 最初の付与日 + N年
  let currentGrantDate = firstGrantDate;
  let nextGrantDate = addYears(firstGrantDate, 1);
  
  while (nextGrantDate <= now) {
    currentGrantDate = nextGrantDate;
    nextGrantDate = addYears(currentGrantDate, 1);
  }
  
  // 法定付与日数
  const legalGrantDays = getLegalGrantDays(tenureYears);
  
  // 5日義務の対象は付与日数10日以上
  const isObligationTarget = legalGrantDays >= 10;
  
  // 義務期限 = 付与基準日 + 1年
  const obligationDeadline = addYears(currentGrantDate, 1);
  const daysUntilDeadline = daysBetween(now, obligationDeadline);
  
  // 残り取得必要日数
  const remainingObligation = Math.max(0, 5 - consumedDays);
  
  // 余裕度を判定
  let paceStatus: LeaveDeadlineInfo["paceStatus"];
  let paceMessage: string;
  
  if (!isObligationTarget) {
    paceStatus = "not_eligible";
    paceMessage = `付与日数${legalGrantDays}日（10日未満のため5日義務対象外）`;
  } else if (consumedDays >= 5) {
    // 5日義務達成済み
    paceStatus = "ok";
    paceMessage = `年5日義務達成済み（${consumedDays}日取得）`;
  } else if (daysUntilDeadline < 0) {
    // 期限超過
    paceStatus = "overdue";
    paceMessage = `期限超過: ${formatDate(obligationDeadline)}までに${5}日の取得義務あり（${consumedDays}日のみ取得）`;
  } else {
    // 残り日数と必要日数の比率で判定
    // 営業日換算: カレンダー日数の約70%が営業日
    const workdaysRemaining = Math.floor(daysUntilDeadline * 0.7);
    const daysNeeded = remainingObligation;
    
    if (daysUntilDeadline <= 30) {
      // 期限まで1ヶ月以内で未達成
      paceStatus = "danger";
      paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要（${formatDate(obligationDeadline)}まで）`;
    } else if (daysUntilDeadline <= 90) {
      // 期限まで3ヶ月以内
      if (daysNeeded >= 4) {
        paceStatus = "danger";
        paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要 — ペース不足`;
      } else {
        paceStatus = "tight";
        paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要（${formatDate(obligationDeadline)}まで）`;
      }
    } else if (daysUntilDeadline <= 180) {
      // 期限まで6ヶ月以内
      if (daysNeeded >= 5) {
        paceStatus = "tight";
        paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要 — 早めに計画を`;
      } else {
        paceStatus = "ok";
        paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要（余裕あり）`;
      }
    } else {
      // 6ヶ月以上ある
      paceStatus = daysNeeded >= 5 ? "ok" : "ok";
      paceMessage = `期限まで${daysUntilDeadline}日、あと${daysNeeded}日取得必要（${formatDate(obligationDeadline)}まで）`;
    }
  }
  
  return {
    joinDate: joinDateStr,
    currentGrantDate: formatDate(currentGrantDate),
    obligationDeadline: formatDate(obligationDeadline),
    daysUntilDeadline,
    legalGrantDays,
    tenureYears: Math.round(tenureYears * 10) / 10,
    remainingObligation,
    paceStatus,
    paceMessage,
    isObligationTarget,
  };
}

/**
 * 有給失効リスクを計算
 * 期限までの残り営業日と残日数を比較し、失効見込みを算出
 */
export function calcExpiryRisk(
  remainingDays: number,
  daysUntilDeadline: number,
  paceStatus: string,
): ExpiryRiskInfo {
  if (remainingDays <= 0 || daysUntilDeadline <= 0) {
    return {
      expiryDays: remainingDays > 0 ? remainingDays : 0,
      workdaysRemaining: 0,
      riskLevel: remainingDays > 0 ? "high" : "none",
      message: remainingDays > 0 ? `${remainingDays}日が失効見込み（期限切れ）` : "失効リスクなし",
    };
  }

  const workdaysRemaining = Math.floor(daysUntilDeadline * 0.7);
  const expiryDays = Math.max(0, remainingDays - workdaysRemaining);

  let riskLevel: ExpiryRiskInfo["riskLevel"] = "none";
  let message = "";

  // 週1日ペース基準: 残日数 ÷ 残り週数 が 1.0 を超えると、週1日の有給取得では消化しきれない
  const weeksRemaining = daysUntilDeadline / 7;
  const daysPerWeekNeeded = weeksRemaining > 0 ? remainingDays / weeksRemaining : remainingDays;

  if (expiryDays > 0) {
    riskLevel = "high";
    message = `${expiryDays}日分が失効の可能性（残${remainingDays}日/営業日約${workdaysRemaining}日）`;
  } else if (daysPerWeekNeeded > 1.0) {
    // 週1日ペースでは消化しきれない → 計画的消化が必要
    riskLevel = "medium";
    message = `期限まで${daysUntilDeadline}日、残${remainingDays}日（週${daysPerWeekNeeded.toFixed(1)}日の消化が必要）`;
  } else {
    riskLevel = "none";
    message = "失効リスクなし";
  }

  return { expiryDays, workdaysRemaining, riskLevel, message };
}

/**
 * 取得ペース指標を計算
 * 付与日数を期限内に均等消化するペースと実績を比較
 */
export function calcConsumptionPace(
  grantedDays: number,
  consumedDays: number,
  joinDateStr: string,
  today?: Date,
): ConsumptionPaceInfo {
  const now = today ?? new Date();
  
  if (grantedDays <= 0) {
    return {
      idealMonthlyPace: 0,
      actualMonthlyPace: 0,
      paceRatio: 0,
      paceLevel: "not_applicable",
      message: "付与日数なし",
    };
  }

  const deadline = calcLeaveDeadline(joinDateStr, consumedDays, now);
  if (deadline.paceStatus === "not_eligible") {
    return {
      idealMonthlyPace: 0,
      actualMonthlyPace: 0,
      paceRatio: 0,
      paceLevel: "not_applicable",
      message: "対象外",
    };
  }

  // 付与日から現在までの経過月数
  const grantDate = new Date(deadline.currentGrantDate);
  const elapsedMs = now.getTime() - grantDate.getTime();
  const elapsedMonths = Math.max(1, elapsedMs / (30.44 * 24 * 60 * 60 * 1000));

  // 理想ペース: 付与日数 / 12ヶ月
  const idealMonthlyPace = Math.round((grantedDays / 12) * 100) / 100;
  // 実績ペース
  const actualMonthlyPace = Math.round((consumedDays / elapsedMonths) * 100) / 100;
  // ペース比率
  const paceRatio = idealMonthlyPace > 0 ? Math.round((actualMonthlyPace / idealMonthlyPace) * 100) / 100 : 0;

  let paceLevel: ConsumptionPaceInfo["paceLevel"];
  let message: string;

  if (paceRatio >= 0.7) {
    paceLevel = "good";
    message = `月${actualMonthlyPace.toFixed(1)}日ペース（理想${idealMonthlyPace.toFixed(1)}日/月）`;
  } else if (paceRatio >= 0.4) {
    paceLevel = "slow";
    message = `月${actualMonthlyPace.toFixed(1)}日ペース（理想${idealMonthlyPace.toFixed(1)}日/月に対し遅れ気味）`;
  } else {
    paceLevel = "very_slow";
    message = `月${actualMonthlyPace.toFixed(1)}日ペース（理想${idealMonthlyPace.toFixed(1)}日/月の${Math.round(paceRatio * 100)}%）`;
  }

  return { idealMonthlyPace, actualMonthlyPace, paceRatio, paceLevel, message };
}

/**
 * 繰越活用度を計算
 * 繰越日数がある場合、その消化見込みを判定
 */
// ═══════════════════════════════════════════════════════════════
// 自動計算関数群
// ═══════════════════════════════════════════════════════════════

/**
 * 入社日と年度から、当該年度の法定付与日数を自動計算する
 * 
 * ロジック:
 * - 入社6ヶ月後の付与基準日を基点に、年度内に付与日があるか判定
 * - 年度 = 4月1日〜翌3月31日
 * - 付与基準日: 初回は入社+6ヶ月、以降毎年同月同日
 * - 付与日が年度内にある場合、その時点の勤続年数で法定テーブルを参照
 */
export function calcAutoGrantedDays(joinDateStr: string, fiscalYear: number): number {
  if (!joinDateStr) return 0;
  const joinDate = new Date(joinDateStr);
  if (isNaN(joinDate.getTime())) return 0;

  // 年度の範囲: fiscalYear年4月1日 〜 (fiscalYear+1)年3月31日
  const fyStart = new Date(fiscalYear, 3, 1);  // 4月1日
  const fyEnd = new Date(fiscalYear + 1, 2, 31); // 翌年3月31日

  // 初回付与日: 入社+6ヶ月
  const firstGrantDate = addMonths(joinDate, 6);

  // まだ初回付与日が来ていない場合（年度開始時点で入社6ヶ月未満）
  // → 年度内に初回付与日があるか確認
  // 付与基準日一覧を生成: firstGrantDate, +1年, +2年, ...
  // 年度内に該当する付与基準日の最新のものを採用
  let grantDateInFY: Date | null = null;
  let tenureAtGrant = 0;

  // firstGrantDate から順に見ていく
  let currentGrantDate = new Date(firstGrantDate);
  let grantIndex = 0; // 0=初回(0.5年), 1=1.5年, 2=2.5年, ...

  while (currentGrantDate <= fyEnd) {
    if (currentGrantDate >= fyStart && currentGrantDate <= fyEnd) {
      grantDateInFY = new Date(currentGrantDate);
      tenureAtGrant = grantIndex === 0 ? 0.5 : 0.5 + grantIndex;
    }
    // 次の付与基準日（初回の1年後、2年後...）
    grantIndex++;
    currentGrantDate = addYears(firstGrantDate, grantIndex);
  }

  if (!grantDateInFY) return 0;

  return getLegalGrantDays(tenureAtGrant);
}

/**
 * 前年度の残日数から繰越日数を計算
 * 
 * ロジック（労基法115条の2年時効）:
 * - 前年度に付与された日数のうち、使い残した分が翌年度に繰り越される
 * - ただし2年で時効消滅するため、繰り越せるのは1回のみ
 * - つまり: 繰越日数 = 前年度の残日数
 *   （前年度の残日数には、前々年度からの繰越分は含まれていても
 *    それは前年度末で時効消滅するため、実質は前年度付与分の残りのみ）
 * 
 * 簡易計算:
 * - prevYearRemaining: 前年度の(付与+繰越-消化-時効) = 残日数
 * - ただし、前年度繰越分は前年度末で時効になるため:
 *   繰越可能 = min(前年度残日数, 前年度付与日数 - 前年度で前年度付与分から消化した日数)
 * 
 * 実務簡易版:
 * - 繰越日数 = 前年度の残日数（前年度データがある場合）
 *   ※ 前年度の時効処理が正しければ、残日数 = 今年度への繰越可能分
 */
export function calcAutoCarryoverDays(prevYearRemainingDays: number | undefined): number {
  if (prevYearRemainingDays === undefined || prevYearRemainingDays === null) return 0;
  return Math.max(0, prevYearRemainingDays);
}

/**
 * 時効消滅日数を計算
 * 
 * ロジック（労基法115条）:
 * - 付与された有給休暇は2年で時効消滅
 * - 当年度末時点で、2年前に付与された分のうち未消化分が時効
 * - 時効日数 = 2年前の付与日数 - 2年間で消化した日数のうち2年前付与分に充当した分
 * 
 * 簡易計算:
 * - 繰越日数（＝前年度から持ち越した分）のうち、当年度で消化しきれなかった分
 * - 時効日数 = max(0, 繰越日数 - 繰越分から消化した日数)
 * - 先入先出原則: 繰越分から先に消化
 * - つまり: 時効日数 = max(0, 繰越日数 - 消化日数)
 *   ※ 消化日数が繰越日数以上なら時効0
 */
export function calcAutoExpiredDays(
  carriedOverDays: number,
  consumedDays: number,
): number {
  if (carriedOverDays <= 0) return 0;
  // 先入先出: 消化日数はまず繰越分から使われる
  const usedFromCarryover = Math.min(consumedDays, carriedOverDays);
  return Math.max(0, carriedOverDays - usedFromCarryover);
}

// ═══════════════════════════════════════════════════════════════

export function calcCarryoverUtil(
  carriedOverDays: number,
  consumedDays: number,
  remainingDays: number,
  grantedDays: number,
  daysUntilDeadline: number,
): CarryoverUtilInfo {
  if (carriedOverDays <= 0) {
    return {
      carriedOverDays: 0,
      unusedCarryover: 0,
      utilLevel: "not_applicable",
      message: "繰越なし",
    };
  }

  // 繰越分は先に消化されると仮定（先入先出）
  // 繰越分の消化済み = min(consumedDays, carriedOverDays)
  const usedFromCarryover = Math.min(consumedDays, carriedOverDays);
  const unusedCarryover = carriedOverDays - usedFromCarryover;

  let utilLevel: CarryoverUtilInfo["utilLevel"];
  let message: string;

  if (unusedCarryover <= 0) {
    utilLevel = "good";
    message = `繰越${carriedOverDays}日を全て消化済み`;
  } else if (daysUntilDeadline > 90 || unusedCarryover <= 2) {
    utilLevel = "warning";
    message = `繰越${carriedOverDays}日のうち${unusedCarryover}日が未消化 — 優先消化推奨`;
  } else {
    utilLevel = "danger";
    message = `繰越${carriedOverDays}日のうち${unusedCarryover}日が未消化 — 失効の恐れあり`;
  }

  return { carriedOverDays, unusedCarryover, utilLevel, message };
}
