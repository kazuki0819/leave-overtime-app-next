"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Link from "next/link";
import { useRouter, usePathname, useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  Pencil,
  Save,
  X,
  ShieldAlert,
  TriangleAlert,
  AlertTriangle,
  CalendarClock,
  Timer,
  TrendingUp,
  CheckCircle2,
  Info,
  FileText,
  CalendarDays,
  Plus,
  Check,
  Trash2,
  Ban,
  Building2,
  UserX,
  UserCheck,
  History,
  Lock,
  LockOpen,
  Calculator,
  RotateCcw,
  Gift,
  Briefcase,
  MessageSquare,
  ChevronDown,
  Undo2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import type { Employee, PaidLeave, MonthlyOvertime, EmployeeAlert, LeaveUsage, AssignmentHistory, SpecialLeave } from "@/lib/schema";
import type { PaidLeaveExtended, PaidLeaveCycleSummary } from "@/lib/storage";
import { calcLeaveDeadline, calcExpiryRisk, calcConsumptionPace, calcCarryoverUtil, calcAutoGrantedDays, calcAutoCarryoverDays, calcAutoExpiredDays, getCurrentCycleRange, type CycleRange, type LeaveDeadlineInfo, type ExpiryRiskInfo, type ConsumptionPaceInfo, type CarryoverUtilInfo } from "@/lib/leave-calc";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { VoidLeaveUsageDialog } from "@/components/void-leave-usage-dialog";

const MONTHS_FY = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export default function EmployeeDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Employee & PaidLeave>>({});

  // Feature A: Overtime inline editing state (string-based for clean keyboard input)
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editOT, setEditOT] = useState<{
    overtimeHours: string; lateNightOvertime: string;
    holidayWorkLegal: string; holidayWorkNonLegal: string;
    holidayWorkLegalCount: string; holidayWorkNonLegalCount: string;
  }>({
    overtimeHours: "", lateNightOvertime: "",
    holidayWorkLegal: "", holidayWorkNonLegal: "",
    holidayWorkLegalCount: "", holidayWorkNonLegalCount: "",
  });
  // Helper: parse editOT string to number (empty/invalid → 0)
  const parseOT = (v: string) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const parseOTInt = (v: string) => { const n = parseInt(v); return isNaN(n) ? 0 : n; };

  // Special leave state
  const [showAddSpecialLeave, setShowAddSpecialLeave] = useState(false);
  const [newSpecialLeave, setNewSpecialLeave] = useState({
    startDate: "",
    endDate: "",
    days: 1,
    leaveType: "慶弔休暇",
    reason: "",
  });

  // PR-4: Void dialog state
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<LeaveUsage | null>(null);

  // Memo inline edit state
  const [isMemoEditing, setIsMemoEditing] = useState(false);
  const [memoText, setMemoText] = useState("");

  // Manual override state for auto-calculated fields
  const [manualOverrides, setManualOverrides] = useState<{
    grantedDays: boolean;
    carriedOverDays: boolean;
    expiredDays: boolean;
  }>({ grantedDays: false, carriedOverDays: false, expiredDays: false });

  // Retirement dialog state
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireDate, setRetireDate] = useState("");

  // Collapsible section state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [specialLeaveOpen, setSpecialLeaveOpen] = useState(false);

  // Past cycle accordion state (first one open by default)
  const [pastCycleOpenMap, setPastCycleOpenMap] = useState<Record<number, boolean>>({});

  // Cycle card add-form state: which cycle's form is open (null = none)
  const [cycleAddFormOpen, setCycleAddFormOpen] = useState<string | null>(null);
  const [cycleAddForm, setCycleAddForm] = useState({ recordDate: "", days: 1, note: "" });

  // Cycle card adjustment-form state (independent from usage add-form)
  const [cycleAdjFormOpen, setCycleAdjFormOpen] = useState<string | null>(null);
  const [cycleAdjForm, setCycleAdjForm] = useState({ recordDate: "", days: "", adjustmentType: "increase" as "increase" | "decrease", reason: "" });

  // Assignment history state
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null);
  const [historyForm, setHistoryForm] = useState({
    assignment: "",
    startDate: "",
    endDate: "",
    note: "",
  });

  const { data: employee, isLoading: empLoading } = useQuery<Employee>({
    queryKey: ["/api/employees", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/employees/${id}`);
      return res.json();
    },
  });

  const currentYear = new Date().getFullYear();

  const { data: paidLeave } = useQuery<PaidLeaveExtended | null>({
    queryKey: ["/api/paid-leaves", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/paid-leaves/${id}`);
      return res.json();
    },
  });

  const { data: overtimes } = useQuery<MonthlyOvertime[]>({
    queryKey: ["/api/monthly-overtimes", id, currentYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/monthly-overtimes?employeeId=${id}&year=${currentYear}`);
      return res.json();
    },
  });

  const { data: allAlerts } = useQuery<EmployeeAlert[]>({
    queryKey: ["/api/alerts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/alerts");
      return res.json();
    },
  });

  // Feature B: fetch leave usages
  const { data: leaveUsages } = useQuery<LeaveUsage[]>({
    queryKey: ["/api/leave-usages", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/leave-usages?employeeId=${id}`);
      return res.json();
    },
  });

  const { data: cycleSummaries } = useQuery<PaidLeaveCycleSummary[]>({
    queryKey: ["/api/paid-leaves/all", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/paid-leaves/${id}/all`);
      return res.json();
    },
  });

  // Assignment history query
  const { data: assignmentHistories } = useQuery<AssignmentHistory[]>({
    queryKey: ["/api/assignment-histories", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/assignment-histories/${id}`);
      return res.json();
    },
  });

  // Special leave query
  const { data: specialLeavesData } = useQuery<SpecialLeave[]>({
    queryKey: ["/api/special-leaves", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/special-leaves?employeeId=${id}`);
      return res.json();
    },
  });

  const updateEmpMutation = useMutation({
    mutationFn: async (data: Partial<Employee>) => {
      const res = await apiRequest("PATCH", `/api/employees/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "保存しました" });
      setIsEditing(false);
    },
  });

  const updateLeaveMutation = useMutation({
    mutationFn: async (data: Partial<PaidLeave>) => {
      const res = await apiRequest("PUT", "/api/paid-leaves", {
        employeeId: id,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
    },
  });

  const upsertOvertimeMutation = useMutation({
    mutationFn: async (data: { month: number; overtimeHours: number; lateNightOvertime: number; holidayWorkLegal?: number; holidayWorkNonLegal?: number; holidayWorkLegalCount?: number; holidayWorkNonLegalCount?: number }) => {
      const res = await apiRequest("PUT", "/api/monthly-overtimes", {
        employeeId: id,
        year: currentYear,
        ...data,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-overtimes", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/overtime-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "残業データを保存しました" });
      setEditingMonth(null);
    },
  });

  // Feature B: create leave usage mutation
  const createLeaveUsageMutation = useMutation({
    mutationFn: async (data: { employeeId: string; recordDate: string; days: number; note: string }) => {
      const res = await apiRequest("POST", "/api/leave-usages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "有給使用を追加しました" });
      setCycleAddForm({ recordDate: "", days: 1, note: "" });
    },
  });

  // Cycle card: add adjustment mutation
  const addCycleAdjustmentMutation = useMutation({
    mutationFn: async (data: { paidLeaveId: number; recordDate: string; days: number; reason: string }) => {
      const res = await apiRequest("POST", "/api/leave-adjustments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "補正値を追加しました" });
      setCycleAdjForm({ recordDate: "", days: "", adjustmentType: "increase", reason: "" });
    },
  });

  // Feature B: delete leave usage mutation
  const deleteLeaveUsageMutation = useMutation({
    mutationFn: async (usageId: number) => {
      const res = await apiRequest("DELETE", `/api/leave-usages/${usageId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "有給使用を削除しました" });
    },
  });

  // Memo save mutation
  const saveMemoMutation = useMutation({
    mutationFn: async (memo: string) => {
      const res = await apiRequest("PATCH", `/api/employees/${id}`, { memo });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: [`/api/employees/${id}`] });
      setIsMemoEditing(false);
      toast({ title: "メモを保存しました" });
    },
  });

  // Special leave mutations
  const createSpecialLeaveMutation = useMutation({
    mutationFn: async (data: { employeeId: string; startDate: string; endDate: string; days: number; leaveType: string; reason: string }) => {
      const res = await apiRequest("POST", "/api/special-leaves", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-leaves", id] });
      setShowAddSpecialLeave(false);
      setNewSpecialLeave({ startDate: "", endDate: "", days: 1, leaveType: "慶弔休暇", reason: "" });
      toast({ title: "特別休暇を登録しました" });
    },
    onError: () => toast({ title: "登録に失敗しました", variant: "destructive" }),
  });

  const deleteSpecialLeaveMutation = useMutation({
    mutationFn: async (slId: number) => {
      const res = await apiRequest("DELETE", `/api/special-leaves/${slId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/special-leaves", id] });
      toast({ title: "特別休暇を削除しました" });
    },
  });

  // Retire mutation
  const retireMutation = useMutation({
    mutationFn: async (retiredDate: string) => {
      const res = await apiRequest("POST", `/api/employees/${id}/retire`, { retiredDate });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assignment-histories", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "退職処理が完了しました" });
      setRetireDialogOpen(false);
      setRetireDate("");
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Reinstate mutation
  const reinstateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/employees/${id}/reinstate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "在籍復帰しました" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Assignment history CRUD mutations
  const createHistoryMutation = useMutation({
    mutationFn: async (data: { employeeId: string; assignment: string; startDate: string; endDate: string; note: string }) => {
      const res = await apiRequest("POST", "/api/assignment-histories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignment-histories", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "配属履歴を追加しました" });
      setShowAddHistory(false);
      setHistoryForm({ assignment: "", startDate: "", endDate: "", note: "" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const updateHistoryMutation = useMutation({
    mutationFn: async ({ histId, data }: { histId: number; data: Partial<AssignmentHistory> }) => {
      const res = await apiRequest("PATCH", `/api/assignment-histories/${histId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignment-histories", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "配属履歴を更新しました" });
      setEditingHistoryId(null);
      setHistoryForm({ assignment: "", startDate: "", endDate: "", note: "" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  const deleteHistoryMutation = useMutation({
    mutationFn: async (histId: number) => {
      const res = await apiRequest("DELETE", `/api/assignment-histories/${histId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assignment-histories", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      toast({ title: "配属履歴を削除しました" });
    },
    onError: (error: Error) => {
      toast({ title: "エラー", description: error.message, variant: "destructive" });
    },
  });

  // Assignment history helpers
  const sortedHistories = useMemo(() => {
    return [...(assignmentHistories ?? [])].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
  }, [assignmentHistories]);

  const startEditHistory = (h: AssignmentHistory) => {
    setEditingHistoryId(h.id);
    setHistoryForm({
      assignment: h.assignment,
      startDate: h.startDate,
      endDate: h.endDate,
      note: h.note,
    });
  };

  const saveHistory = () => {
    if (editingHistoryId !== null) {
      updateHistoryMutation.mutate({
        histId: editingHistoryId,
        data: historyForm,
      });
    } else {
      createHistoryMutation.mutate({
        employeeId: id,
        ...historyForm,
      });
    }
  };

  const handleDeleteHistory = (histId: number) => {
    if (!window.confirm("この配属履歴を削除しますか？")) return;
    deleteHistoryMutation.mutate(histId);
  };

  const isRetired = employee?.status === "retired";

  // 期限計算（入社日ベース）
  const deadline: LeaveDeadlineInfo | null = useMemo(() => {
    if (!employee?.joinDate) return null;
    return calcLeaveDeadline(employee.joinDate, paidLeave?.consumedDays ?? 0);
  }, [employee?.joinDate, paidLeave?.consumedDays]);

  // 健全性指標
  const expiryRisk: ExpiryRiskInfo | null = useMemo(() => {
    if (!paidLeave || !deadline) return null;
    return calcExpiryRisk(paidLeave.remainingDays, deadline.daysUntilDeadline, deadline.paceStatus);
  }, [paidLeave, deadline]);

  const consumptionPace: ConsumptionPaceInfo | null = useMemo(() => {
    if (!paidLeave || !employee?.joinDate) return null;
    return calcConsumptionPace(paidLeave.grantedDays, paidLeave.consumedDays, employee.joinDate);
  }, [paidLeave, employee?.joinDate]);

  const carryoverUtil: CarryoverUtilInfo | null = useMemo(() => {
    if (!paidLeave || !deadline) return null;
    return calcCarryoverUtil(paidLeave.carriedOverDays, paidLeave.consumedDays, paidLeave.remainingDays, paidLeave.grantedDays, deadline.daysUntilDeadline);
  }, [paidLeave, deadline]);

  const empAlerts = (allAlerts ?? []).filter((a) => a.employeeId === id);
  const dangerAlerts = empAlerts.filter((a) => a.severity === "danger");
  const warningAlerts = empAlerts.filter((a) => a.severity === "warning");
  const cautionAlerts = empAlerts.filter((a) => a.severity === "caution");
  const infoAlerts = empAlerts.filter((a) => a.severity === "info");
  const noticeAlerts = empAlerts.filter((a) => a.severity === "notice");
  const overtimeAlerts = empAlerts.filter((a) => a.category === "overtime");
  const leaveAlerts = empAlerts.filter((a) => a.category === "paid_leave");

  // 有給取得履歴から消化日数を自動算出
  const computedConsumedDays = useMemo(() => {
    if (!leaveUsages || leaveUsages.length === 0) return paidLeave?.consumedDays ?? 0;
    return leaveUsages.reduce((sum, u) => sum + u.days, 0);
  }, [leaveUsages, paidLeave?.consumedDays]);

  const currentCycle = useMemo(() => {
    if (!employee?.joinDate) return null;
    return getCurrentCycleRange(employee.joinDate);
  }, [employee?.joinDate]);

  // DB値ベースの現在サイクル: isInProgress===true の最後の要素、なければ配列末尾をフォールバック
  const currentCycleSummary = useMemo(() => {
    if (!cycleSummaries || cycleSummaries.length === 0) return null;
    const inProgress = cycleSummaries.filter((c) => c.isInProgress);
    if (inProgress.length > 0) return inProgress[inProgress.length - 1];
    return cycleSummaries[cycleSummaries.length - 1];
  }, [cycleSummaries]);

  // 前サイクルの補正影響(繰越ポップオーバー用)
  const prevCycleSummary = useMemo(() => {
    if (!cycleSummaries || !currentCycleSummary) return null;
    const idx = cycleSummaries.indexOf(currentCycleSummary);
    return idx > 0 ? cycleSummaries[idx - 1] : null;
  }, [cycleSummaries, currentCycleSummary]);

  // 現在サイクルの補正レコード件数(差分ノート用)
  const currentCycleAdjCount = useMemo(() => {
    if (!leaveUsages || !currentCycleSummary) return 0;
    return leaveUsages.filter(
      (u) => u.recordType === "adjustment" && !u.isVoided
        && u.recordDate >= currentCycleSummary.cycleStartDate
        && u.recordDate <= currentCycleSummary.cycleEndDate
    ).length;
  }, [leaveUsages, currentCycleSummary]);

  const pastCycleSummaries = useMemo(() => {
    if (!cycleSummaries || !currentCycleSummary) return [];
    return cycleSummaries
      .filter((c) => c !== currentCycleSummary)
      .slice()
      .reverse();
  }, [cycleSummaries, currentCycleSummary]);

  const currentCycleUsages = useMemo(() => {
    if (!leaveUsages || !currentCycleSummary) return [];
    return [...leaveUsages]
      .filter((u) => {
        const d = u.recordDate || u.startDate;
        return d >= currentCycleSummary.cycleStartDate && d <= currentCycleSummary.cycleEndDate;
      })
      .sort((a, b) => {
        const da = a.recordDate || a.startDate;
        const db = b.recordDate || b.startDate;
        return da.localeCompare(db) || a.id - b.id;
      });
  }, [leaveUsages, currentCycleSummary]);

  // 自動計算値
  const autoGrantedDays = useMemo(() => {
    if (!employee?.joinDate || !currentCycle) return 0;
    const cycleStartYear = new Date(currentCycle.startDate).getFullYear();
    return calcAutoGrantedDays(employee.joinDate, cycleStartYear);
  }, [employee?.joinDate, currentCycle]);

  const autoCarryoverDays = useMemo(() => {
    return calcAutoCarryoverDays(paidLeave?.carriedOverDays);
  }, [paidLeave?.carriedOverDays]);

  // 自動時効日数: 非編集時は DB 値（paid_leaves.expired_days）を直接参照、
  // 編集中は編集フォームの繰越・消化値からリアルタイム計算
  const autoExpiredDays = useMemo(() => {
    if (!isEditing) {
      return paidLeave?.expiredDays ?? 0;
    }
    return calcAutoExpiredDays(editForm.carriedOverDays ?? 0, computedConsumedDays);
  }, [isEditing, editForm.carriedOverDays, computedConsumedDays, paidLeave?.expiredDays]);

  const startEditing = () => {
    // 現在の値が自動計算値と一致するかを判定し、手動上書き状態を初期化
    const currentGranted = paidLeave?.grantedDays ?? 0;
    const currentCarryover = paidLeave?.carriedOverDays ?? 0;
    const currentExpired = paidLeave?.expiredDays ?? 0;
    const expectedExpired = calcAutoExpiredDays(currentCarryover, computedConsumedDays);

    setManualOverrides({
      grantedDays: currentGranted !== autoGrantedDays && currentGranted !== 0,
      carriedOverDays: currentCarryover !== autoCarryoverDays && currentCarryover !== 0,
      expiredDays: currentExpired !== expectedExpired && currentExpired !== 0,
    });

    setEditForm({
      name: employee?.name,
      assignment: employee?.assignment,
      joinDate: employee?.joinDate,
      tenureMonths: employee?.tenureMonths,
      grantedDays: currentGranted !== 0 ? currentGranted : autoGrantedDays,
      carriedOverDays: currentCarryover !== 0 ? currentCarryover : autoCarryoverDays,
      expiredDays: currentExpired !== 0 ? currentExpired : expectedExpired,
    });
    setIsEditing(true);
  };

  // Computed values for paid leave edit form
  // 消化日数は常に取得履歴合計から算出（編集モードでも手動変更不可）
  const computedRemainingDays = Math.max(
    0,
    (editForm.grantedDays ?? 0) +
      (editForm.carriedOverDays ?? 0) -
      computedConsumedDays -
      (editForm.expiredDays ?? 0)
  );
  const computedUsageRate =
    (editForm.grantedDays ?? 0) > 0
      ? computedConsumedDays / (editForm.grantedDays ?? 0)
      : 0;

  const saveEdit = () => {
    // Validate: prevent saving if any value is negative
    const fields = [
      { key: "grantedDays", label: "付与日数" },
      { key: "carriedOverDays", label: "繰越日数" },
      { key: "expiredDays", label: "時効日数" },
    ] as const;
    for (const { key, label } of fields) {
      if ((editForm[key] ?? 0) < 0) {
        toast({ title: "入力エラー", description: `${label}は0以上の値を入力してください`, variant: "destructive" });
        return;
      }
    }
    const joinDateChanged = editForm.joinDate !== employee?.joinDate;
    if (joinDateChanged) {
      if (!window.confirm("入社日を変更すると、この社員の有給サイクルが再計算されます。よろしいですか？")) {
        return;
      }
    }
    if (joinDateChanged) {
      updateEmpMutation.mutate({
        name: editForm.name,
        assignment: editForm.assignment,
        joinDate: editForm.joinDate,
        tenureMonths: editForm.tenureMonths,
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves/all", id] });
          queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
          queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
        },
      });
    } else {
      updateEmpMutation.mutate({
        name: editForm.name,
        assignment: editForm.assignment,
        joinDate: editForm.joinDate,
        tenureMonths: editForm.tenureMonths,
      });
      updateLeaveMutation.mutate({
        grantedDays: editForm.grantedDays,
        carriedOverDays: editForm.carriedOverDays,
        expiredDays: editForm.expiredDays,
      });
    }
  };

  // Feature A: start editing a month row
  const startEditMonth = (month: number, existing?: MonthlyOvertime) => {
    setEditingMonth(month);
    setEditOT({
      overtimeHours: (existing?.overtimeHours ?? 0).toFixed(2),
      lateNightOvertime: (existing?.lateNightOvertime ?? 0).toFixed(2),
      holidayWorkLegal: (existing?.holidayWorkLegal ?? 0).toFixed(2),
      holidayWorkNonLegal: (existing?.holidayWorkNonLegal ?? 0).toFixed(2),
      holidayWorkLegalCount: String(existing?.holidayWorkLegalCount ?? 0),
      holidayWorkNonLegalCount: String(existing?.holidayWorkNonLegalCount ?? 0),
    });
  };

  // Feature A: save overtime row
  const saveOvertimeRow = () => {
    if (editingMonth === null) return;
    upsertOvertimeMutation.mutate({
      month: editingMonth,
      overtimeHours: parseOT(editOT.overtimeHours),
      lateNightOvertime: parseOT(editOT.lateNightOvertime),
      holidayWorkLegal: parseOT(editOT.holidayWorkLegal),
      holidayWorkNonLegal: parseOT(editOT.holidayWorkNonLegal),
      holidayWorkLegalCount: parseOTInt(editOT.holidayWorkLegalCount),
      holidayWorkNonLegalCount: parseOTInt(editOT.holidayWorkNonLegalCount),
    });
  };

  const saveCycleLeaveUsage = (cycleStart: string, cycleEnd: string) => {
    if (!cycleAddForm.recordDate || cycleAddForm.days <= 0) {
      toast({ title: "入力エラー", description: "取得日・日数は必須です", variant: "destructive" });
      return;
    }
    if (cycleAddForm.recordDate < cycleStart || cycleAddForm.recordDate > cycleEnd) {
      toast({ title: "入力エラー", description: `取得日はサイクル期間（${cycleStart} 〜 ${cycleEnd}）の範囲内で入力してください`, variant: "destructive" });
      return;
    }
    createLeaveUsageMutation.mutate({
      employeeId: id,
      recordDate: cycleAddForm.recordDate,
      days: cycleAddForm.days,
      note: cycleAddForm.note,
    });
  };

  const saveCycleAdjustment = (paidLeaveId: number, cycleStart: string, cycleEnd: string) => {
    if (!cycleAdjForm.recordDate) {
      toast({ title: "入力エラー", description: "日付は必須です", variant: "destructive" });
      return;
    }
    if (cycleAdjForm.recordDate < cycleStart || cycleAdjForm.recordDate > cycleEnd) {
      toast({ title: "入力エラー", description: `日付はサイクル期間（${cycleStart} 〜 ${cycleEnd}）の範囲内で入力してください`, variant: "destructive" });
      return;
    }
    const absValue = Math.abs(parseFloat(cycleAdjForm.days));
    if (!cycleAdjForm.days || isNaN(absValue) || absValue === 0) {
      toast({ title: "入力エラー", description: "日数を入力してください", variant: "destructive" });
      return;
    }
    if (!cycleAdjForm.reason.trim()) {
      toast({ title: "入力エラー", description: "理由は必須です", variant: "destructive" });
      return;
    }
    const days = cycleAdjForm.adjustmentType === "increase" ? -absValue : absValue;
    addCycleAdjustmentMutation.mutate({
      paidLeaveId,
      recordDate: cycleAdjForm.recordDate,
      days,
      reason: cycleAdjForm.reason,
    });
  };

  // Feature B: delete leave usage with confirm
  const handleDeleteLeaveUsage = (usageId: number) => {
    if (!window.confirm("この有給使用を削除しますか？")) return;
    deleteLeaveUsageMutation.mutate(usageId);
  };

  if (empLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground">社員が見つかりません</p>
        <Link href="/employees" className="text-primary hover:underline">
          社員一覧に戻る
        </Link>
      </div>
    );
  }

  const totalOvertime = (overtimes ?? []).reduce((s, o) => s + o.overtimeHours, 0);
  const avgOvertime = overtimes && overtimes.length > 0 ? totalOvertime / overtimes.length : 0;
  const overtimeMap = new Map((overtimes ?? []).map((o) => [o.month, o]));

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/employees">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" data-testid="text-employee-name">
                {employee.name}
              </h1>
              {isRetired && (
                <Badge variant="outline" className="text-xs border-slate-400 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  退職
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {employee.assignment === "-" ? "本社" : employee.assignment}
              {isRetired && employee.retiredDate && (
                <span className="ml-2 text-xs">（退職日: {employee.retiredDate}）</span>
              )}
            </p>
          </div>
          {/* Status badges */}
          <div className="flex gap-1.5 ml-2">
            {dangerAlerts.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                違反 {dangerAlerts.length}件
              </Badge>
            )}
            {warningAlerts.length > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
              >
                警告 {warningAlerts.length}件
              </Badge>
            )}
            {cautionAlerts.length > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400"
              >
                注意 {cautionAlerts.length}件
              </Badge>
            )}
            {infoAlerts.length > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
              >
                参考 {infoAlerts.length}件
              </Badge>
            )}
            {noticeAlerts.length > 0 && (
              <Badge
                variant="outline"
                className="text-xs border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-400"
              >
                管理情報 {noticeAlerts.length}件
              </Badge>
            )}
            {empAlerts.length === 0 && (
              <Badge
                variant="outline"
                className="text-xs border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                問題なし
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                onClick={saveEdit}
                disabled={updateEmpMutation.isPending}
                data-testid="button-save"
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                保存
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(false)}
                data-testid="button-cancel"
              >
                <X className="h-3.5 w-3.5 mr-1" />
                キャンセル
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={startEditing}
                data-testid="button-edit"
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                編集
              </Button>
              {isRetired ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                  onClick={() => {
                    if (window.confirm("この社員を在籍に復帰させますか？")) {
                      reinstateMutation.mutate();
                    }
                  }}
                  disabled={reinstateMutation.isPending}
                  data-testid="button-reinstate"
                >
                  <UserCheck className="h-3.5 w-3.5 mr-1" />
                  在籍復帰
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                  onClick={() => setRetireDialogOpen(true)}
                  data-testid="button-retire"
                >
                  <UserX className="h-3.5 w-3.5 mr-1" />
                  退職処理
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Alert Panel (top-level, prominent) ─── */}
      {empAlerts.length > 0 && (
        <Card className={`border-2 ${
          dangerAlerts.length > 0 
            ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20" 
            : warningAlerts.length > 0
            ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
            : cautionAlerts.length > 0
            ? "border-cyan-300 bg-cyan-50/50 dark:border-cyan-800 dark:bg-cyan-950/20"
            : "border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20"
        }`}>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className={`h-4 w-4 ${dangerAlerts.length > 0 ? "text-red-500" : warningAlerts.length > 0 ? "text-amber-500" : cautionAlerts.length > 0 ? "text-cyan-500" : "text-blue-500"}`} />
              アラート一覧 ({empAlerts.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {/* Danger alerts */}
              {dangerAlerts.length > 0 && (
                <div className="space-y-1.5">
                  {dangerAlerts.map((a, i) => (
                    <div
                      key={`d-${i}`}
                      className="flex items-start gap-2 rounded-md bg-red-100 dark:bg-red-950/50 px-3 py-2"
                    >
                      <ShieldAlert className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs px-1.5 py-0">
                            {a.category === "overtime" ? "残業" : "有給"}
                          </Badge>
                          <span className="text-xs font-semibold text-red-800 dark:text-red-300">違反</span>
                        </div>
                        <p className="text-sm text-red-800 dark:text-red-300 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Warning alerts */}
              {warningAlerts.length > 0 && (
                <div className="space-y-1.5">
                  {warningAlerts.map((a, i) => (
                    <div
                      key={`w-${i}`}
                      className="flex items-start gap-2 rounded-md bg-amber-100 dark:bg-amber-950/50 px-3 py-2"
                    >
                      <TriangleAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 border-amber-400 bg-amber-200/50 text-amber-800 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-300"
                          >
                            {a.category === "overtime" ? "残業" : "有給"}
                          </Badge>
                          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">警告</span>
                        </div>
                        <p className="text-sm text-amber-800 dark:text-amber-300 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Caution alerts (注意：健康リスク) */}
              {cautionAlerts.length > 0 && (
                <div className="space-y-1.5">
                  {cautionAlerts.map((a, i) => (
                    <div
                      key={`c-${i}`}
                      className="flex items-start gap-2 rounded-md bg-cyan-100 dark:bg-cyan-950/50 px-3 py-2"
                    >
                      <AlertTriangle className="h-4 w-4 text-cyan-600 dark:text-cyan-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 border-cyan-400 bg-cyan-200/50 text-cyan-800 dark:border-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-300"
                          >
                            注意
                          </Badge>
                        </div>
                        <p className="text-sm text-cyan-800 dark:text-cyan-300 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Info alerts (参考) */}
              {infoAlerts.length > 0 && (
                <div className="space-y-1.5">
                  {infoAlerts.map((a, i) => (
                    <div
                      key={`i-${i}`}
                      className="flex items-start gap-2 rounded-md bg-blue-100 dark:bg-blue-950/50 px-3 py-2"
                    >
                      <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 border-blue-400 bg-blue-200/50 text-blue-800 dark:border-blue-600 dark:bg-blue-900/30 dark:text-blue-300"
                          >
                            参考
                          </Badge>
                        </div>
                        <p className="text-sm text-blue-800 dark:text-blue-300 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {/* Notice alerts (管理情報) */}
              {noticeAlerts.length > 0 && (
                <div className="space-y-1.5">
                  {noticeAlerts.map((a, i) => (
                    <div
                      key={`n-${i}`}
                      className="flex items-start gap-2 rounded-md bg-slate-100 dark:bg-slate-800/50 px-3 py-2"
                    >
                      <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs px-1.5 py-0 border-slate-300 bg-slate-200/50 text-slate-600 dark:border-slate-600 dark:bg-slate-700/30 dark:text-slate-400"
                          >
                            管理情報
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">{a.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 社員情報 */}
        <Card className="border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <User className="h-4 w-4 text-blue-500" />
              社員情報
              <Button
                size="sm"
                variant={isMemoEditing ? "default" : employee?.memo ? "outline" : "ghost"}
                className={`h-6 px-2 text-xs ml-auto gap-1 ${
                  !isMemoEditing && employee?.memo ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" : ""
                }`}
                onClick={() => {
                  if (isMemoEditing) {
                    setIsMemoEditing(false);
                  } else {
                    setMemoText(employee?.memo ?? "");
                    setIsMemoEditing(true);
                  }
                }}
              >
                <MessageSquare className="h-3 w-3" />
                メモ
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">氏名</Label>
                  <Input
                    value={editForm.name ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    data-testid="input-name"
                  />
                </div>
                <div>
                  <Label className="text-xs">配属先</Label>
                  <Input
                    value={editForm.assignment ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, assignment: e.target.value })}
                    data-testid="input-assignment"
                  />
                </div>
                <div>
                  <Label className="text-xs">入社日</Label>
                  <DateInput
                    value={editForm.joinDate ?? ""}
                    onChange={(v) => setEditForm({ ...editForm, joinDate: v })}
                    data-testid="input-join-date"
                  />
                </div>
                <div>
                  <Label className="text-xs">勤続月数</Label>
                  <Input
                    type="number"
                    value={editForm.tenureMonths ?? 0}
                    onChange={(e) => setEditForm({ ...editForm, tenureMonths: parseInt(e.target.value) || 0 })}
                    data-testid="input-tenure"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-xs">メモ</Label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-y"
                    value={editForm.memo ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                    placeholder="フリーコメント（任意）"
                    data-testid="input-memo"
                  />
                </div>
              </div>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">氏名</dt>
                  <dd className="text-sm font-medium">{employee.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">配属先</dt>
                  <dd className="text-sm font-medium">{employee.assignment}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">入社日</dt>
                  <dd className="text-sm font-medium">{employee.joinDate || "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">勤続期間</dt>
                  <dd className="text-sm font-medium">{Math.floor(employee.tenureMonths / 12)}年{employee.tenureMonths % 12}ヶ月</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">ステータス</dt>
                  <dd className="text-sm font-medium">
                    {isRetired ? (
                      <span className="text-slate-500">退職済</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">在籍中</span>
                    )}
                  </dd>
                </div>
                {isRetired && employee.retiredDate && (
                  <div>
                    <dt className="text-xs text-muted-foreground">退職日</dt>
                    <dd className="text-sm font-medium text-slate-500">{employee.retiredDate}</dd>
                  </div>
                )}
                {/* 配属履歴 */}
                {sortedHistories.length > 0 && (
                  <div className="sm:col-span-2 pt-1 border-t border-border/50 mt-1">
                    <dt className="text-xs text-muted-foreground mb-1.5">配属履歴</dt>
                    <dd className="space-y-1">
                      {sortedHistories.map((h, i) => (
                        <div key={h.id} className="flex items-center gap-2 text-xs">
                          <span className={`font-medium ${
                            i === 0 && !h.endDate ? "text-foreground" : "text-muted-foreground"
                          }`}>
                            {h.assignment === "-" ? "本社" : h.assignment}
                          </span>
                          <span className="text-muted-foreground tabular-nums">
                            {h.startDate} 〜 {h.endDate || "現在"}
                          </span>
                          {i === 0 && !h.endDate && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                              現在
                            </Badge>
                          )}
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
                {/* 特別休暇 */}
                {specialLeavesData && specialLeavesData.length > 0 && (
                  <div className="sm:col-span-2 pt-1 border-t border-border/50 mt-1">
                    <dt className="text-xs text-muted-foreground mb-1.5">特別休暇（{specialLeavesData.length}件）</dt>
                    <dd className="space-y-1">
                      {[...specialLeavesData].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((sl) => (
                        <div key={sl.id} className="flex items-center gap-2 text-xs">
                          <Badge variant="outline" className="text-[10px] px-1 py-0 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
                            {sl.leaveType}
                          </Badge>
                          <span className="text-muted-foreground tabular-nums">
                            {sl.startDate} 〜 {sl.endDate}
                          </span>
                          <span className="font-medium">{Number(sl.days).toFixed(2)}日</span>
                          {sl.reason && (
                            <span className="text-muted-foreground/60 truncate max-w-[150px]">{sl.reason}</span>
                          )}
                        </div>
                      ))}
                    </dd>
                  </div>
                )}
                {/* メモ（表示モード） */}
                {!isMemoEditing && employee.memo && (
                  <div className="sm:col-span-2 pt-1 border-t border-border/50 mt-1">
                    <dt className="text-xs text-muted-foreground mb-1">メモ</dt>
                    <dd className="text-sm text-muted-foreground whitespace-pre-wrap">{employee.memo}</dd>
                  </div>
                )}
                {/* メモ（インライン編集） */}
                {isMemoEditing && (
                  <div className="sm:col-span-2 pt-1 border-t border-border/50 mt-1">
                    <dt className="text-xs text-muted-foreground mb-1">メモ</dt>
                    <dd>
                      <textarea
                        className="flex w-full rounded-md border border-blue-300 dark:border-blue-700 bg-background px-3 py-2 text-sm min-h-[60px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={memoText}
                        onChange={(e) => setMemoText(e.target.value)}
                        placeholder="フリーコメント（任意）"
                        autoFocus
                      />
                      <div className="flex gap-2 mt-1.5">
                        <Button size="sm" className="h-7 text-xs" disabled={saveMemoMutation.isPending}
                          onClick={() => saveMemoMutation.mutate(memoText)}>
                          {saveMemoMutation.isPending ? "保存中..." : "保存"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => setIsMemoEditing(false)}>
                          キャンセル
                        </Button>
                      </div>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </CardContent>
        </Card>

      </div>

      {/* 有給休暇 — 編集モード / 未登録時 */}
      {(isEditing || !paidLeave) && (
        <Card className="border mb-5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Calendar className="h-4 w-4 text-emerald-500" />
              有給休暇{(currentCycleSummary?.cycleStartDate ?? currentCycle?.startDate) ? `（${currentCycleSummary?.cycleStartDate ?? currentCycle?.startDate}〜）` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* 付与日数 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Calculator className="h-3 w-3 text-blue-500" />
                        付与日数
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-xs flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => {
                                const next = !manualOverrides.grantedDays;
                                setManualOverrides(prev => ({ ...prev, grantedDays: next }));
                                if (!next) {
                                  setEditForm(prev => ({ ...prev, grantedDays: autoGrantedDays }));
                                }
                              }}
                              data-testid="toggle-grantedDays"
                            >
                              {manualOverrides.grantedDays ? (
                                <><LockOpen className="h-3 w-3" /> 手動</>
                              ) : (
                                <><Lock className="h-3 w-3 text-blue-500" /> 自動</>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {manualOverrides.grantedDays
                              ? `自動値に戻す: ${autoGrantedDays}日（労基法39条）`
                              : "手動で上書き"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {manualOverrides.grantedDays ? (
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editForm.grantedDays ?? 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setEditForm({ ...editForm, grantedDays: isNaN(val) ? 0 : val });
                          }}
                          className="border-amber-300 dark:border-amber-700"
                          data-testid="input-grantedDays"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => {
                            setManualOverrides(prev => ({ ...prev, grantedDays: false }));
                            setEditForm(prev => ({ ...prev, grantedDays: autoGrantedDays }));
                          }}
                          data-testid="reset-grantedDays"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="h-9 px-3 flex items-center justify-between rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        onClick={() => setManualOverrides(prev => ({ ...prev, grantedDays: true }))}
                        data-testid="auto-grantedDays"
                      >
                        <span className="text-sm font-bold tabular-nums">{editForm.grantedDays ?? autoGrantedDays}</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">労基法39条</span>
                      </div>
                    )}
                  </div>

                  {/* 繰越日数 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Calculator className="h-3 w-3 text-blue-500" />
                        繰越日数
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-xs flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => {
                                const next = !manualOverrides.carriedOverDays;
                                setManualOverrides(prev => ({ ...prev, carriedOverDays: next }));
                                if (!next) {
                                  setEditForm(prev => {
                                    const updated = { ...prev, carriedOverDays: autoCarryoverDays };
                                    if (!manualOverrides.expiredDays) {
                                      updated.expiredDays = calcAutoExpiredDays(autoCarryoverDays, computedConsumedDays);
                                    }
                                    return updated;
                                  });
                                }
                              }}
                              data-testid="toggle-carriedOverDays"
                            >
                              {manualOverrides.carriedOverDays ? (
                                <><LockOpen className="h-3 w-3" /> 手動</>
                              ) : (
                                <><Lock className="h-3 w-3 text-blue-500" /> 自動</>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {manualOverrides.carriedOverDays
                              ? `自動値に戻す: ${autoCarryoverDays}日（前年度残日数）`
                              : "手動で上書き"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {manualOverrides.carriedOverDays ? (
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editForm.carriedOverDays ?? 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            const newCarry = isNaN(val) ? 0 : val;
                            setEditForm(prev => {
                              const updated = { ...prev, carriedOverDays: newCarry };
                              if (!manualOverrides.expiredDays) {
                                updated.expiredDays = calcAutoExpiredDays(newCarry, computedConsumedDays);
                              }
                              return updated;
                            });
                          }}
                          className="border-amber-300 dark:border-amber-700"
                          data-testid="input-carriedOverDays"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => {
                            setManualOverrides(prev => ({ ...prev, carriedOverDays: false }));
                            setEditForm(prev => {
                              const updated = { ...prev, carriedOverDays: autoCarryoverDays };
                              if (!manualOverrides.expiredDays) {
                                updated.expiredDays = calcAutoExpiredDays(autoCarryoverDays, computedConsumedDays);
                              }
                              return updated;
                            });
                          }}
                          data-testid="reset-carriedOverDays"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="h-9 px-3 flex items-center justify-between rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        onClick={() => setManualOverrides(prev => ({ ...prev, carriedOverDays: true }))}
                        data-testid="auto-carriedOverDays"
                      >
                        <span className="text-sm font-bold tabular-nums">{editForm.carriedOverDays ?? autoCarryoverDays}</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">労基法115条</span>
                      </div>
                    )}
                  </div>

                  {/* 消化日数 */}
                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1">
                      <Calculator className="h-3 w-3 text-blue-500" />
                      消化日数
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-auto flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> 取得履歴から自動算出
                      </span>
                    </Label>
                    <div className="h-9 px-3 flex items-center justify-between rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800" data-testid="auto-consumedDays">
                      <span className="text-sm font-bold tabular-nums">{computedConsumedDays}</span>
                      <span className="text-[10px] text-blue-600 dark:text-blue-400">履歴合計</span>
                    </div>
                  </div>

                  {/* 時効日数 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Calculator className="h-3 w-3 text-blue-500" />
                        時効日数
                      </Label>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-xs flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => {
                                const next = !manualOverrides.expiredDays;
                                setManualOverrides(prev => ({ ...prev, expiredDays: next }));
                                if (!next) {
                                  setEditForm(prev => ({
                                    ...prev,
                                    expiredDays: calcAutoExpiredDays(prev.carriedOverDays ?? 0, computedConsumedDays),
                                  }));
                                }
                              }}
                              data-testid="toggle-expiredDays"
                            >
                              {manualOverrides.expiredDays ? (
                                <><LockOpen className="h-3 w-3" /> 手動</>
                              ) : (
                                <><Lock className="h-3 w-3 text-blue-500" /> 自動</>
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            {manualOverrides.expiredDays
                              ? `自動値に戻す: ${autoExpiredDays}日（繰越分の未消化 = 時効）`
                              : "手動で上書き"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {manualOverrides.expiredDays ? (
                      <div className="flex gap-1">
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={editForm.expiredDays ?? 0}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setEditForm({ ...editForm, expiredDays: isNaN(val) ? 0 : val });
                          }}
                          className="border-amber-300 dark:border-amber-700"
                          data-testid="input-expiredDays"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => {
                            setManualOverrides(prev => ({ ...prev, expiredDays: false }));
                            setEditForm(prev => ({
                              ...prev,
                              expiredDays: calcAutoExpiredDays(prev.carriedOverDays ?? 0, computedConsumedDays),
                            }));
                          }}
                          data-testid="reset-expiredDays"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="h-9 px-3 flex items-center justify-between rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        onClick={() => setManualOverrides(prev => ({ ...prev, expiredDays: true }))}
                        data-testid="auto-expiredDays"
                      >
                        <span className="text-sm font-bold tabular-nums">{editForm.expiredDays ?? autoExpiredDays}</span>
                        <span className="text-[10px] text-blue-600 dark:text-blue-400">先入先出</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div className="text-xs text-muted-foreground col-span-2 font-medium mb-0.5">自動計算（読み取り専用）</div>
                  <div>
                    <span className="text-xs text-muted-foreground">残日数</span>
                    <div className="text-sm font-bold tabular-nums text-primary" data-testid="computed-remainingDays">{computedRemainingDays}</div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">取得率</span>
                    <div className={`text-sm font-bold tabular-nums ${
                      computedUsageRate < 0.3 ? "text-red-600 dark:text-red-400"
                      : computedUsageRate < 0.7 ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400"
                    }`} data-testid="computed-usageRate">
                      {(computedUsageRate * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    残日数 ＝ 付与 ＋ 繰越 − 消化 − 時効（最小0）
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {autoGrantedDays > 0 ? (
                  <div className="space-y-3">
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <CalendarDays className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-800 dark:text-blue-300">
                            現在のサイクルで有給付与対象です（法定 {autoGrantedDays}日）
                          </p>
                          <p className="mt-1 text-blue-700/80 dark:text-blue-400/70">
                            有給データが未登録です。下のボタンで自動計算値をもとにデータを作成できます。
                          </p>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        const expiredDays = calcAutoExpiredDays(autoCarryoverDays, 0);
                        updateLeaveMutation.mutate({
                          grantedDays: autoGrantedDays,
                          carriedOverDays: autoCarryoverDays,
                          expiredDays: expiredDays,
                        });
                      }}
                      disabled={updateLeaveMutation.isPending}
                      data-testid="button-create-leave-record"
                    >
                      <Plus className="mr-1.5 h-4 w-4" />
                      {updateLeaveMutation.isPending ? "作成中..." : "有給データを作成"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">有給データがありません</p>
                    {employee?.joinDate && (() => {
                      const join = new Date(employee.joinDate);
                      const firstGrant = new Date(join);
                      firstGrant.setMonth(firstGrant.getMonth() + 6);
                      const now = new Date();
                      if (firstGrant > now) {
                        const diffMs = firstGrant.getTime() - now.getTime();
                        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                        return (
                          <p className="text-xs text-muted-foreground">
                            初回付与予定: {firstGrant.toISOString().slice(0, 10)}（あと{diffDays}日）
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── 配属履歴 ─── */}
      <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Building2 className="h-4 w-4 text-indigo-500" />
                配属履歴
                <span className="text-xs font-normal text-muted-foreground">
                  {sortedHistories.length}件
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            {!isRetired && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setHistoryOpen(true);
                  setShowAddHistory(true);
                  setEditingHistoryId(null);
                  setHistoryForm({ assignment: "", startDate: "", endDate: "", note: "" });
                }}
                data-testid="button-add-history"
              >
                <Plus className="h-3.5 w-3.5" />
                追加
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="assignment-history-table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">配属先</th>
                  <th className="pb-2 font-medium">開始日</th>
                  <th className="pb-2 font-medium">終了日</th>
                  <th className="pb-2 font-medium">備考</th>
                  <th className="pb-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {/* Add row */}
                {showAddHistory && (
                  <tr className="border-b bg-muted/30">
                    <td className="py-1 pr-2">
                      <Input
                        value={historyForm.assignment}
                        onChange={(e) => setHistoryForm({ ...historyForm, assignment: e.target.value })}
                        placeholder="配属先名（本社は「-」）"
                        className="h-7 text-xs"
                        data-testid="input-new-history-assignment"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <DateInput
                        value={historyForm.startDate}
                        onChange={(v) => setHistoryForm({ ...historyForm, startDate: v })}
                        className="h-7 text-xs"
                        data-testid="input-new-history-start-date"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <DateInput
                        value={historyForm.endDate}
                        onChange={(v) => setHistoryForm({ ...historyForm, endDate: v })}
                        className="h-7 text-xs"
                        placeholder="空欄=現在"
                        data-testid="input-new-history-end-date"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={historyForm.note}
                        onChange={(e) => setHistoryForm({ ...historyForm, note: e.target.value })}
                        placeholder="備考（任意）"
                        className="h-7 text-xs"
                        data-testid="input-new-history-note"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={saveHistory}
                          disabled={createHistoryMutation.isPending || !historyForm.startDate}
                          data-testid="button-save-new-history"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAddHistory(false)}
                          data-testid="button-cancel-new-history"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Existing rows */}
                {sortedHistories.length === 0 && !showAddHistory && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                      配属履歴がありません
                    </td>
                  </tr>
                )}
                {sortedHistories.map((h) => {
                  const isEditingThis = editingHistoryId === h.id;
                  const isCurrent = !h.endDate;
                  return (
                    <tr key={h.id} className={`border-b ${isCurrent ? "bg-indigo-50/50 dark:bg-indigo-950/20" : ""}`} data-testid={`row-history-${h.id}`}>
                      {isEditingThis ? (
                        <>
                          <td className="py-1 pr-2">
                            <Input
                              value={historyForm.assignment}
                              onChange={(e) => setHistoryForm({ ...historyForm, assignment: e.target.value })}
                              className="h-7 text-xs"
                              data-testid={`input-edit-history-assignment-${h.id}`}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <DateInput
                              value={historyForm.startDate}
                              onChange={(v) => setHistoryForm({ ...historyForm, startDate: v })}
                              className="h-7 text-xs"
                              data-testid={`input-edit-history-start-${h.id}`}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <DateInput
                              value={historyForm.endDate}
                              onChange={(v) => setHistoryForm({ ...historyForm, endDate: v })}
                              className="h-7 text-xs"
                              data-testid={`input-edit-history-end-${h.id}`}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <Input
                              value={historyForm.note}
                              onChange={(e) => setHistoryForm({ ...historyForm, note: e.target.value })}
                              className="h-7 text-xs"
                              data-testid={`input-edit-history-note-${h.id}`}
                            />
                          </td>
                          <td className="py-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={saveHistory}
                                disabled={updateHistoryMutation.isPending}
                                data-testid={`button-save-history-${h.id}`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingHistoryId(null)}
                                data-testid={`button-cancel-history-${h.id}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2">
                            <div className="flex items-center gap-1.5">
                              {isCurrent && (
                                <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                              )}
                              <span className={`font-medium ${isCurrent ? "text-indigo-700 dark:text-indigo-400" : ""}`}>
                                {h.assignment === "-" ? "本社" : h.assignment}
                              </span>
                              {isCurrent && (
                                <Badge variant="outline" className="text-xs px-1 py-0 border-indigo-300 bg-indigo-100 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
                                  現在
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-2 tabular-nums text-muted-foreground">{h.startDate}</td>
                          <td className="py-2 tabular-nums text-muted-foreground">{h.endDate || "―"}</td>
                          <td className="py-2 text-xs text-muted-foreground max-w-[180px] truncate">{h.note || "―"}</td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => startEditHistory(h)}
                                data-testid={`button-edit-history-${h.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleDeleteHistory(h.id)}
                                disabled={deleteHistoryMutation.isPending}
                                data-testid={`button-delete-history-${h.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* ═══ v24 2窓表示: 残日数サマリ（最上部配置） ═══ */}
      {paidLeave && currentCycleSummary && !isEditing && (
        <>
          <div className="flex justify-between items-center mt-1 mb-3">
            <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight">
              現在のサイクル — 残日数サマリ
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[var(--accent-soft)] text-[var(--pr4-accent)] rounded-full text-[10px] font-semibold tracking-wide">
              <span className="w-[5px] h-[5px] rounded-full bg-current" />
              進行中{` · ${currentCycleSummary.cycleStartDate} 〜 ${currentCycleSummary.cycleEndDate}`}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-3 mb-4">
            {/* Primary: 補正計算（実残日数） */}
            <article className="bg-[var(--surface)] border border-[var(--ink)] rounded-[10px] p-[22px_24px] shadow-md relative">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-[15px] font-semibold text-[var(--ink)] tracking-tight">補正計算（実残日数）</div>
                  <div className="text-[11px] text-[var(--ink-50)] mt-0.5">業務での参照値・補正値あり</div>
                </div>
                <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold px-2 py-[3px] rounded bg-[var(--ink)] text-[var(--surface)] tracking-wide">
                  <span className="w-[5px] h-[5px] rounded-full bg-current" />PRIMARY
                </span>
              </div>
              <div className="flex items-baseline gap-3 flex-wrap my-4">
                <span className="text-[56px] font-semibold leading-[0.9] tracking-tighter text-[var(--ink)]">
                  {currentCycleSummary.adjustedRemaining.toFixed(1)}
                </span>
                <span className="text-[13px] font-normal text-[var(--ink-50)]">日</span>
                {currentCycleSummary.adjustmentDays !== 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--pr4-accent)] bg-[var(--accent-soft)] px-2 py-[3px] rounded self-center">
                    {currentCycleSummary.adjustmentDays < 0 ? "+" : ""}
                    {(-currentCycleSummary.adjustmentDays).toFixed(1)} 補正
                  </span>
                )}
              </div>
              <div className="pt-3 border-t border-[var(--pr4-border)] text-xs">
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>付与日数</span>
                  <span className="font-mono font-medium text-[var(--ink)]">+{Number(currentCycleSummary.grantedDays).toFixed(1)}</span>
                </div>
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span className="flex items-center gap-1">
                    繰越日数
                    {prevCycleSummary && (prevCycleSummary.adjustedRemaining - prevCycleSummary.autoRemaining) !== 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center w-[14px] h-[14px] rounded-full bg-[var(--accent-soft)] text-[var(--pr4-accent)] text-[9px] font-bold border border-[var(--pr4-accent)]/20 cursor-help"
                          >
                            i
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="bottom"
                          align="center"
                          sideOffset={8}
                          className="w-[240px] bg-[var(--ink)] text-[var(--surface)] border-none shadow-lg p-[12px_14px] rounded-md text-[11px] leading-[1.6]"
                        >
                          <div className="font-semibold text-[var(--surface)] mb-1.5 pb-1.5 border-b border-white/15 text-[11px]">繰越日数の内訳</div>
                          <div className="flex justify-between py-0.5 text-white/70">
                            <span>自動計算分</span>
                            <span className="font-mono font-medium text-[var(--surface)]">{currentCycleSummary.carriedOverDays.toFixed(1)}</span>
                          </div>
                          <div className="flex justify-between py-0.5 text-white/70">
                            <span>補正値由来分</span>
                            <span className="font-mono font-semibold text-[#5eead4]">
                              {(prevCycleSummary.adjustedRemaining - prevCycleSummary.autoRemaining) >= 0 ? "+" : ""}{(prevCycleSummary.adjustedRemaining - prevCycleSummary.autoRemaining).toFixed(1)}
                            </span>
                          </div>
                          <div className="text-[10px] text-white/55 mt-1.5 pt-1.5 border-t border-white/10 italic">
                            補正値由来分は、前サイクルの補正値が繰越に与えた影響を示します
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </span>
                  <span className="font-mono font-medium text-[var(--ink)]">+{Number(currentCycleSummary.carriedOverDays).toFixed(1)}</span>
                </div>
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>消化日数（取得）</span>
                  <span className="font-mono font-medium text-[var(--ink)]">−{Number(currentCycleSummary.usageOnlyDays).toFixed(1)}</span>
                </div>
                {currentCycleSummary.adjustmentDays !== 0 && (
                  <div className="flex justify-between py-1 text-[var(--pr4-accent)] font-semibold">
                    <span>補正値合計（増減）</span>
                    <span className="font-mono">{currentCycleSummary.adjustmentDays < 0 ? "+" : ""}{(-currentCycleSummary.adjustmentDays).toFixed(1)}</span>
                  </div>
                )}
              </div>
            </article>

            {/* Secondary: 自動計算（補正値なし） */}
            <article className="bg-[var(--surface-2)] border border-dashed border-[var(--pr4-border)] rounded-[10px] p-[22px_24px] relative">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <div className="text-[15px] font-medium text-[var(--ink-70)] tracking-tight">自動計算（補正値なし）</div>
                  <div className="text-[11px] text-[var(--ink-50)] mt-0.5">参考値・影響を切り分け</div>
                </div>
                <span className="inline-flex items-center gap-[5px] text-[10px] font-semibold px-2 py-[3px] rounded border border-[var(--border-strong)] text-[var(--ink-50)] tracking-wide">
                  REFERENCE
                </span>
              </div>
              <div className="flex items-baseline gap-3 flex-wrap my-4">
                <span className="text-[42px] font-medium leading-[0.9] tracking-tighter text-[var(--ink-50)]">
                  {currentCycleSummary.autoRemaining.toFixed(1)}
                </span>
                <span className="text-[13px] font-normal text-[var(--ink-50)]">日</span>
              </div>
              <div className="pt-3 border-t border-[var(--pr4-border)] text-xs">
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>付与日数</span>
                  <span className="font-mono font-medium text-[var(--ink)]">+{Number(currentCycleSummary.grantedDays).toFixed(1)}</span>
                </div>
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>繰越日数（自動計算分のみ）</span>
                  <span className="font-mono font-medium text-[var(--ink)]">+{Number(currentCycleSummary.carriedOverDays).toFixed(1)}</span>
                </div>
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>消化日数（取得）</span>
                  <span className="font-mono font-medium text-[var(--ink)]">−{Number(currentCycleSummary.usageOnlyDays).toFixed(1)}</span>
                </div>
                <div className="flex justify-between py-1 text-[var(--ink-70)]">
                  <span>補正値の反映</span>
                  <span className="font-mono text-[var(--ink-35)]">─</span>
                </div>
              </div>
            </article>
          </div>

          {/* 2窓の差分説明ノート */}
          {(() => {
            const twoWindowDiff = currentCycleSummary.adjustedRemaining - currentCycleSummary.autoRemaining;
            return twoWindowDiff !== 0 ? (
              <div className="flex gap-3 items-start bg-[var(--accent-soft)] border border-[var(--pr4-accent)]/12 border-l-[3px] border-l-[var(--pr4-accent)] rounded-md px-4 py-3 mb-5">
                <span className="w-[18px] h-[18px] rounded-full bg-[var(--pr4-accent)] text-white inline-flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">i</span>
                <p className="text-xs leading-relaxed text-[var(--ink-70)]">
                  補正反映済みと自動計算の差は <strong className="font-semibold text-[var(--pr4-accent)]">{twoWindowDiff >= 0 ? "+" : ""}{twoWindowDiff.toFixed(1)}日</strong> です（補正値{currentCycleAdjCount}件）。過渡的補正値の場合、過去履歴の入力が進めば両窓が一致していき、担当者の判断で解除できます。
                </p>
              </div>
            ) : null;
          })()}

          {/* 5日義務・期限・健全性は既存ロジックを維持 */}
          <div className="mb-5 bg-[var(--surface)] border border-[var(--pr4-border)] rounded-[10px] p-5 shadow-xs">
            {/* 5-day progress bar */}
            <div>
              <div className="flex justify-between text-xs text-[var(--ink-50)] mb-1">
                <span>年5日義務達成状況</span>
                <span className="tabular-nums font-medium">
                  {Math.min(paidLeave.consumedDays, 5).toFixed(2)}/5.00日
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    paidLeave.consumedDays >= 5
                      ? "bg-[var(--green)]"
                      : paidLeave.consumedDays >= 3
                      ? "bg-[var(--amber)]"
                      : "bg-[var(--red)]"
                  }`}
                  style={{ width: `${Math.min(100, (paidLeave.consumedDays / 5) * 100)}%` }}
                />
              </div>
            </div>

            {/* 期限・ペース情報 */}
            {deadline && deadline.paceStatus !== "not_eligible" && (
              <div className="mt-3 pt-3 border-t border-[var(--pr4-border)]">
                <div className="flex items-center gap-1.5 mb-2">
                  <CalendarClock className="h-3.5 w-3.5 text-[var(--ink-50)]" />
                  <span className="text-xs font-medium text-[var(--ink-50)]">取得期限・ペース</span>
                  <Badge
                    variant={deadline.paceStatus === "overdue" || deadline.paceStatus === "danger" ? "danger" : deadline.paceStatus === "ok" ? "success" : "warn"}
                    className="text-xs ml-auto px-1.5 py-0"
                  >
                    {deadline.paceStatus === "ok" && "余裕あり"}
                    {deadline.paceStatus === "tight" && "やや注意"}
                    {deadline.paceStatus === "danger" && "ペース不足"}
                    {deadline.paceStatus === "overdue" && "期限超過"}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[var(--ink-50)]">付与基準日</dt>
                    <dd className="font-medium tabular-nums text-[var(--ink)]">{deadline.currentGrantDate}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-50)]">義務期限</dt>
                    <dd className="font-medium tabular-nums text-[var(--ink)]">{deadline.obligationDeadline}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-50)]">期限まで</dt>
                    <dd className={`font-bold tabular-nums ${
                      deadline.daysUntilDeadline <= 30
                        ? "text-[var(--red)]"
                        : deadline.daysUntilDeadline <= 90
                        ? "text-[var(--amber)]"
                        : "text-[var(--ink)]"
                    }`}>
                      {deadline.daysUntilDeadline > 0 ? `${deadline.daysUntilDeadline}日` : "期限超過"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-50)]">残り必要日数</dt>
                    <dd className={`font-bold tabular-nums ${
                      deadline.remainingObligation > 0 ? "text-[var(--amber)]" : "text-[var(--green)]"
                    }`}>
                      {deadline.remainingObligation > 0
                        ? `あと${deadline.remainingObligation}日`
                        : <span className="inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />達成</span>
                      }
                    </dd>
                  </div>
                </dl>
                <div className={`mt-2 rounded px-2 py-1.5 text-xs ${
                  deadline.paceStatus === "ok"
                    ? "bg-[var(--green-soft)] text-[var(--green)]"
                    : deadline.paceStatus === "tight"
                    ? "bg-[var(--amber-soft)] text-[var(--amber)]"
                    : "bg-[var(--red-soft)] text-[var(--red)]"
                }`}>
                  {deadline.paceMessage}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--ink-50)]">
                  <span>勤続 {deadline.tenureYears}年</span>
                  <span>法定付与 {deadline.legalGrantDays}日</span>
                </div>
              </div>
            )}
            {deadline && deadline.paceStatus === "not_eligible" && (
              <div className="mt-3 pt-3 border-t border-[var(--pr4-border)]">
                <div className="flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-[var(--ink-50)]" />
                  <span className="text-xs text-[var(--ink-50)]">{deadline.paceMessage}</span>
                </div>
              </div>
            )}
          </div>

          {/* ═══ 現在サイクル 履歴一覧テーブル ═══ */}
          <div className="border border-[var(--pr4-border)] rounded-md overflow-hidden mb-5">
            <div className="px-4 py-2.5 border-b border-[var(--pr4-border)] flex justify-between items-center bg-[var(--surface-2)]">
              <h3 className="text-[13px] font-semibold text-[var(--ink)]">履歴一覧</h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--ink-50)] font-mono">{currentCycleUsages.length} 件</span>
                <Button
                  size="sm"
                  variant={cycleAdjFormOpen === "__current__" ? "default" : "outline"}
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => {
                    if (cycleAdjFormOpen === "__current__") {
                      setCycleAdjFormOpen(null);
                    } else {
                      setCycleAdjFormOpen("__current__");
                      setCycleAdjForm({ recordDate: "", days: "", adjustmentType: "increase", reason: "" });
                    }
                  }}
                >
                  {cycleAdjFormOpen === "__current__" ? (
                    <><X className="h-3 w-3" />閉じる</>
                  ) : (
                    <><Plus className="h-3 w-3" />補正</>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={cycleAddFormOpen === "__current__" ? "default" : "outline"}
                  className="h-6 px-2 text-[10px] gap-1"
                  onClick={() => {
                    if (cycleAddFormOpen === "__current__") {
                      setCycleAddFormOpen(null);
                    } else {
                      setCycleAddFormOpen("__current__");
                      setCycleAddForm({ recordDate: "", days: 1, note: "" });
                    }
                  }}
                >
                  {cycleAddFormOpen === "__current__" ? (
                    <><X className="h-3 w-3" />閉じる</>
                  ) : (
                    <><Plus className="h-3 w-3" />追加</>
                  )}
                </Button>
              </div>
            </div>
            {cycleAdjFormOpen === "__current__" && (
              <div className="px-4 py-3 border-b border-[var(--pr4-border)] bg-amber-50/30 dark:bg-amber-950/10">
                <div className="flex items-end gap-2 flex-wrap">
                  <div>
                    <Label className="text-[10px] text-[var(--ink-50)]">日付</Label>
                    <DateInput
                      value={cycleAdjForm.recordDate}
                      onChange={(v) => setCycleAdjForm({ ...cycleAdjForm, recordDate: v })}
                      enableWareki
                      className="h-7 text-xs w-[160px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[var(--ink-50)]">増減</Label>
                    <select
                      value={cycleAdjForm.adjustmentType}
                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, adjustmentType: e.target.value as "increase" | "decrease" })}
                      className="h-7 text-xs rounded border border-input bg-background px-2"
                    >
                      <option value="increase">残を増やす</option>
                      <option value="decrease">残を減らす</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-[10px] text-[var(--ink-50)]">日数</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={cycleAdjForm.days}
                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, days: e.target.value })}
                      placeholder="0.0"
                      className="h-7 w-20 text-right text-xs font-mono"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] text-[var(--ink-50)]">理由 <span className="text-[var(--red)]">*</span></Label>
                    <Input
                      value={cycleAdjForm.reason}
                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, reason: e.target.value })}
                      placeholder="理由を入力（必須）"
                      className="h-7 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs gap-1"
                    onClick={() => saveCycleAdjustment(currentCycleSummary.id, currentCycleSummary.cycleStartDate, currentCycleSummary.cycleEndDate)}
                    disabled={addCycleAdjustmentMutation.isPending}
                  >
                    <Check className="h-3 w-3" />
                    保存
                  </Button>
                </div>
                <div className="text-[10px] text-[var(--ink-50)] mt-1.5">
                  対象期間: {currentCycleSummary.cycleStartDate} 〜 {currentCycleSummary.cycleEndDate} ・ 0.125日刻み
                </div>
              </div>
            )}
            {cycleAddFormOpen === "__current__" && (
              <div className="px-4 py-3 border-b border-[var(--pr4-border)] bg-emerald-50/30 dark:bg-emerald-950/10">
                <div className="flex items-end gap-2 flex-wrap">
                  <div>
                    <Label className="text-[10px] text-[var(--ink-50)]">取得日</Label>
                    <DateInput
                      value={cycleAddForm.recordDate}
                      onChange={(v) => setCycleAddForm({ ...cycleAddForm, recordDate: v })}
                      enableWareki
                      className="h-7 text-xs w-[160px]"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] text-[var(--ink-50)]">日数</Label>
                    <Input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={cycleAddForm.days}
                      onChange={(e) => setCycleAddForm({ ...cycleAddForm, days: parseFloat(e.target.value) || 0.5 })}
                      className="h-7 w-20 text-right text-xs"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <Label className="text-[10px] text-[var(--ink-50)]">備考</Label>
                    <Input
                      value={cycleAddForm.note}
                      onChange={(e) => setCycleAddForm({ ...cycleAddForm, note: e.target.value })}
                      placeholder="任意"
                      className="h-7 text-xs"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs gap-1"
                    onClick={() => saveCycleLeaveUsage(currentCycleSummary.cycleStartDate, currentCycleSummary.cycleEndDate)}
                    disabled={createLeaveUsageMutation.isPending}
                  >
                    <Check className="h-3 w-3" />
                    保存
                  </Button>
                </div>
                <div className="text-[10px] text-[var(--ink-50)] mt-1.5">
                  対象期間: {currentCycleSummary.cycleStartDate} 〜 {currentCycleSummary.cycleEndDate}
                </div>
              </div>
            )}
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[var(--surface-2)]">
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "14%" }}>日付</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "14%" }}>種別</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "12%" }}>日数</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]">理由</th>
                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "10%" }}>状態</th>
                  <th className="text-right px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "10%" }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {currentCycleUsages.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--ink-50)] italic">
                      このサイクルの履歴はありません
                    </td>
                  </tr>
                )}
                {currentCycleUsages.map((u) => {
                  const isVoided = !!u.isVoided;
                  const isAdj = u.recordType === "adjustment";
                  const isIncrease = isAdj && u.days < 0;
                  const displayDate = u.recordDate || u.startDate;
                  const daysStr = isAdj
                    ? (isIncrease ? `+${Math.abs(u.days).toFixed(1)}` : `−${Math.abs(u.days).toFixed(1)}`)
                    : u.days.toFixed(1);
                  return (
                    <tr key={u.id} className={`border-b border-[var(--pr4-border)] last:border-b-0 ${isVoided ? "text-[var(--ink-35)]" : ""}`}>
                      <td className="px-4 py-2.5">
                        <span className={`font-mono text-xs ${isVoided ? "line-through text-[var(--ink-35)]" : "text-[var(--ink)]"}`}>{displayDate}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isVoided ? (
                          <Badge variant="voided" className="text-[10px]">{isAdj ? (isIncrease ? "補正（増）" : "補正（減）") : "取得"}</Badge>
                        ) : (
                          <Badge variant={isAdj ? (isIncrease ? "success" : "danger") : "neut"} className="text-[10px]">
                            <span className="w-1 h-1 rounded-full bg-current mr-1" />
                            {isAdj ? (isIncrease ? "補正（増）" : "補正（減）") : "取得"}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold ${
                          isVoided ? "line-through text-[var(--ink-35)]"
                          : isAdj && isIncrease ? "text-[var(--green)]"
                          : isAdj ? "text-[var(--red)]"
                          : "text-[var(--ink)]"
                        }`}>{daysStr}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs ${isVoided ? "line-through text-[var(--ink-35)]" : "text-[var(--ink-70)]"}`}>{u.reason || u.note || "-"}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isVoided ? <Badge variant="voided" className="text-[10px]">解除済</Badge> : <Badge variant="neut" className="text-[10px]">有効</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!isVoided && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-[var(--ink-50)] hover:text-amber-600 hover:bg-amber-50"
                              title="解除（論理削除）"
                              onClick={() => { setVoidTarget(u); setVoidDialogOpen(true); }}
                            >
                              <Ban className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-[var(--ink-50)] hover:text-red-600 hover:bg-red-50"
                            title="削除"
                            disabled={deleteLeaveUsageMutation.isPending}
                            onClick={() => handleDeleteLeaveUsage(u.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══ 過去サイクル ═══ */}
      {paidLeave && !isEditing && pastCycleSummaries.length > 0 && (
        <div className="mb-5">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-[15px] font-semibold text-[var(--ink)] tracking-tight">過去サイクル</h2>
            <span className="text-[11px] text-[var(--ink-50)] font-mono">過去{pastCycleSummaries.length}サイクル表示中</span>
          </div>
          <div className="space-y-2">
            {pastCycleSummaries.map((cycle, idx) => {
              const cycleLabel = idx === 0 ? "前サイクル" : `${idx + 1}サイクル前`;
              const cycleUsages = [...(leaveUsages ?? [])]
                .filter((u) => {
                  const d = u.recordDate || u.startDate;
                  return d >= cycle.cycleStartDate && d <= cycle.cycleEndDate;
                })
                .sort((a, b) => {
                  const da = a.recordDate || a.startDate;
                  const db = b.recordDate || b.startDate;
                  return da.localeCompare(db) || a.id - b.id;
                });
              const adjDisplayTotal = -cycle.adjustmentDays;
              const twoWindowDiff = cycle.adjustedRemaining - cycle.autoRemaining;

              const nextCycleSummary = cycleSummaries
                ? cycleSummaries[cycleSummaries.indexOf(cycle) + 1] ?? null
                : null;

              const isOpen = pastCycleOpenMap[idx] ?? false;
              return (
                <Collapsible
                  key={`${cycle.cycleStartDate}`}
                  open={isOpen}
                  onOpenChange={(v) => setPastCycleOpenMap((prev) => ({ ...prev, [idx]: v }))}
                >
                      <CollapsibleTrigger className="w-full flex items-center gap-3 bg-[var(--surface)] border border-[var(--pr4-border)] rounded-[10px] px-5 py-3.5 cursor-pointer hover:bg-[var(--surface-2)] transition-colors group text-left">
                        <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-50)] transition-transform shrink-0 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--ink)]">{cycleLabel}</div>
                          <div className="text-[11px] text-[var(--ink-50)] font-mono">{cycle.cycleStartDate} 〜 {cycle.cycleEndDate}</div>
                        </div>
                        <div className="flex items-center gap-5 shrink-0">
                          <div className="text-right">
                            <div className="text-[10px] text-[var(--ink-50)]">付与</div>
                            <div className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">{cycle.grantedDays.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[var(--ink-50)]">補正値合計</div>
                            <div className={`text-[13px] font-semibold tabular-nums ${cycle.adjustmentDays !== 0 ? "text-[var(--pr4-accent)]" : "text-[var(--ink-35)]"}`}>
                              {cycle.adjustmentDays !== 0 ? `${adjDisplayTotal >= 0 ? "+" : ""}${adjDisplayTotal.toFixed(1)}` : "─"}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">{cycle.adjustmentDays !== 0 ? "日" : ""}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] text-[var(--ink-50)]">サイクル末残</div>
                            <div className="text-[13px] font-semibold tabular-nums text-[var(--ink)]">{cycle.adjustedRemaining.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="bg-[var(--surface)] border border-t-0 border-[var(--pr4-border)] rounded-b-[10px] -mt-[1px] px-5 py-4">
                          {/* 二窓表示: 補正反映済み / 自動計算のみ */}
                          <div className="grid grid-cols-2 gap-3 mb-4">
                            {/* PRIMARY: 補正反映済み */}
                            <div className="bg-[var(--surface)] border-2 border-[var(--pr4-accent)]/30 rounded-lg p-4">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="w-[6px] h-[6px] rounded-full bg-[var(--pr4-accent)]" />
                                <span className="text-[10px] font-semibold text-[var(--pr4-accent)] tracking-wide uppercase">補正反映済み</span>
                              </div>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-[32px] font-semibold leading-[0.9] tracking-tighter text-[var(--ink)]">
                                  {cycle.adjustedRemaining.toFixed(1)}
                                </span>
                                <span className="text-[11px] text-[var(--ink-50)]">日</span>
                                {cycle.adjustmentDays !== 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--pr4-accent)] bg-[var(--accent-soft)] px-1.5 py-[2px] rounded">
                                    {adjDisplayTotal >= 0 ? "+" : ""}{adjDisplayTotal.toFixed(1)} 補正
                                  </span>
                                )}
                              </div>
                              <div className="pt-2 border-t border-[var(--pr4-border)] text-[11px] space-y-1">
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>付与</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">+{cycle.grantedDays.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>繰越</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">+{cycle.carriedOverDays.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>消化（取得）</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">−{cycle.usageOnlyDays.toFixed(1)}</span>
                                </div>
                                {cycle.adjustmentDays !== 0 && (
                                  <div className="flex justify-between text-[var(--pr4-accent)] font-semibold">
                                    <span>補正値合計</span>
                                    <span className="font-mono">{adjDisplayTotal >= 0 ? "+" : ""}{adjDisplayTotal.toFixed(1)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {/* REFERENCE: 自動計算のみ */}
                            <div className="bg-[var(--surface-2)] border border-[var(--pr4-border)] rounded-lg p-4">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="w-[6px] h-[6px] rounded-full bg-[var(--ink-35)]" />
                                <span className="text-[10px] font-semibold text-[var(--ink-50)] tracking-wide uppercase">自動計算のみ</span>
                              </div>
                              <div className="flex items-baseline gap-2 mb-3">
                                <span className="text-[28px] font-medium leading-[0.9] tracking-tighter text-[var(--ink-50)]">
                                  {cycle.autoRemaining.toFixed(1)}
                                </span>
                                <span className="text-[11px] text-[var(--ink-50)]">日</span>
                              </div>
                              <div className="pt-2 border-t border-[var(--pr4-border)] text-[11px] space-y-1">
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>付与</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">+{cycle.grantedDays.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>繰越</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">+{cycle.carriedOverDays.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>消化（取得）</span>
                                  <span className="font-mono font-medium text-[var(--ink)]">−{cycle.usageOnlyDays.toFixed(1)}</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-70)]">
                                  <span>補正値の反映</span>
                                  <span className="font-mono font-medium text-[var(--ink-50)]">なし</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* 二窓の差分ノート */}
                          {twoWindowDiff !== 0 && (
                            <div className="flex gap-2.5 items-start bg-[var(--accent-soft)] border border-[var(--pr4-accent)]/12 border-l-[3px] border-l-[var(--pr4-accent)] rounded-md px-3 py-2.5 mb-4">
                              <span className="w-[16px] h-[16px] rounded-full bg-[var(--pr4-accent)] text-white inline-flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">i</span>
                              <p className="text-[11px] leading-relaxed text-[var(--ink-70)]">
                                補正反映済みと自動計算の差は <strong className="font-semibold text-[var(--pr4-accent)]">{twoWindowDiff >= 0 ? "+" : ""}{twoWindowDiff.toFixed(1)}日</strong> です
                              </p>
                            </div>
                          )}
                          {/* サイクル全体サマリ */}
                          <div className="bg-[var(--surface-2)] border border-[var(--pr4-border)] rounded-md p-4 mb-4">
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-semibold text-[var(--ink)]">サイクル全体サマリ</span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              <div className="text-center">
                                <div className="text-[10px] text-[var(--ink-50)]">付与日数</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--ink)]">{cycle.grantedDays.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                              </div>
                              <div className="text-center">
                                <div className="text-[10px] text-[var(--ink-50)]">繰越日数</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--ink)]">{cycle.carriedOverDays.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                              </div>
                              <div className="text-center">
                                <div className="text-[10px] text-[var(--ink-50)]">合計</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--ink)]">{cycle.baselineRemaining.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                              </div>
                              <div className="text-center">
                                <div className="text-[10px] text-[var(--ink-50)]">使用日数</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--ink)]">{cycle.usageOnlyDays.toFixed(1)}<span className="text-[10px] font-normal text-[var(--ink-50)] ml-0.5">日</span></div>
                              </div>
                              <div className="text-center bg-[var(--accent-soft)] rounded p-1">
                                <div className="text-[10px] text-[var(--pr4-accent)]">補正値合計</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--pr4-accent)]">
                                  {cycle.adjustmentDays !== 0 ? `${adjDisplayTotal >= 0 ? "+" : ""}${adjDisplayTotal.toFixed(1)}` : "─"}<span className="text-[10px] font-normal ml-0.5">{cycle.adjustmentDays !== 0 ? "日" : ""}</span>
                                </div>
                              </div>
                              <div className="text-center bg-[var(--accent-soft)] rounded p-1">
                                <div className="text-[10px] text-red-600 dark:text-red-400">失効日数</div>
                                <div className="text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{nextCycleSummary ? (cycle.adjustedRemaining - nextCycleSummary.carriedOverDays).toFixed(1) : "─"}<span className="text-[10px] font-normal ml-0.5">{nextCycleSummary ? "日" : ""}</span></div>
                                <div className="border-t border-border/50 my-1"></div>
                                <div className="text-[10px] text-[var(--pr4-accent)]">次サイクル繰越</div>
                                <div className="text-sm font-semibold tabular-nums text-[var(--pr4-accent)]">{nextCycleSummary ? nextCycleSummary.carriedOverDays.toFixed(1) : "─"}<span className="text-[10px] font-normal ml-0.5">{nextCycleSummary ? "日" : ""}</span></div>
                              </div>
                            </div>
                            {twoWindowDiff !== 0 && nextCycleSummary && (
                              <div className="mt-3 pt-3 border-t border-[var(--pr4-border)] text-[11px] text-[var(--ink-70)] leading-relaxed">
                                次サイクル繰越 <strong>{nextCycleSummary.carriedOverDays.toFixed(1)}日</strong>。このサイクルの補正反映済みと自動計算の差は <strong className="text-[var(--pr4-accent)]">{twoWindowDiff >= 0 ? "+" : ""}{twoWindowDiff.toFixed(1)}日</strong> でした。
                              </div>
                            )}
                          </div>

                          {/* 履歴一覧 */}
                          <div className="border border-[var(--pr4-border)] rounded-md overflow-hidden">
                            <div className="px-4 py-2.5 border-b border-[var(--pr4-border)] flex justify-between items-center bg-[var(--surface-2)]">
                              <h3 className="text-[13px] font-semibold text-[var(--ink)]">履歴一覧</h3>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-[var(--ink-50)] font-mono">{cycleUsages.length} 件</span>
                                <Button
                                  size="sm"
                                  variant={cycleAdjFormOpen === cycle.cycleStartDate ? "default" : "outline"}
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => {
                                    if (cycleAdjFormOpen === cycle.cycleStartDate) {
                                      setCycleAdjFormOpen(null);
                                    } else {
                                      setCycleAdjFormOpen(cycle.cycleStartDate);
                                      setCycleAdjForm({ recordDate: "", days: "", adjustmentType: "increase", reason: "" });
                                    }
                                  }}
                                >
                                  {cycleAdjFormOpen === cycle.cycleStartDate ? (
                                    <><X className="h-3 w-3" />閉じる</>
                                  ) : (
                                    <><Plus className="h-3 w-3" />補正</>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant={cycleAddFormOpen === cycle.cycleStartDate ? "default" : "outline"}
                                  className="h-6 px-2 text-[10px] gap-1"
                                  onClick={() => {
                                    if (cycleAddFormOpen === cycle.cycleStartDate) {
                                      setCycleAddFormOpen(null);
                                    } else {
                                      setCycleAddFormOpen(cycle.cycleStartDate);
                                      setCycleAddForm({ recordDate: "", days: 1, note: "" });
                                    }
                                  }}
                                >
                                  {cycleAddFormOpen === cycle.cycleStartDate ? (
                                    <><X className="h-3 w-3" />閉じる</>
                                  ) : (
                                    <><Plus className="h-3 w-3" />追加</>
                                  )}
                                </Button>
                              </div>
                            </div>
                            {cycleAdjFormOpen === cycle.cycleStartDate && (
                              <div className="px-4 py-3 border-b border-[var(--pr4-border)] bg-amber-50/30 dark:bg-amber-950/10">
                                <div className="flex items-end gap-2 flex-wrap">
                                  <div>
                                    <Label className="text-[10px] text-[var(--ink-50)]">日付</Label>
                                    <DateInput
                                      value={cycleAdjForm.recordDate}
                                      onChange={(v) => setCycleAdjForm({ ...cycleAdjForm, recordDate: v })}
                                      enableWareki
                                      className="h-7 text-xs w-[160px]"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-[var(--ink-50)]">増減</Label>
                                    <select
                                      value={cycleAdjForm.adjustmentType}
                                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, adjustmentType: e.target.value as "increase" | "decrease" })}
                                      className="h-7 text-xs rounded border border-input bg-background px-2"
                                    >
                                      <option value="increase">残を増やす</option>
                                      <option value="decrease">残を減らす</option>
                                    </select>
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-[var(--ink-50)]">日数</Label>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={cycleAdjForm.days}
                                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, days: e.target.value })}
                                      placeholder="0.0"
                                      className="h-7 w-20 text-right text-xs font-mono"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-[120px]">
                                    <Label className="text-[10px] text-[var(--ink-50)]">理由 <span className="text-[var(--red)]">*</span></Label>
                                    <Input
                                      value={cycleAdjForm.reason}
                                      onChange={(e) => setCycleAdjForm({ ...cycleAdjForm, reason: e.target.value })}
                                      placeholder="理由を入力（必須）"
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs gap-1"
                                    onClick={() => saveCycleAdjustment(cycle.id, cycle.cycleStartDate, cycle.cycleEndDate)}
                                    disabled={addCycleAdjustmentMutation.isPending}
                                  >
                                    <Check className="h-3 w-3" />
                                    保存
                                  </Button>
                                </div>
                                <div className="text-[10px] text-[var(--ink-50)] mt-1.5">
                                  対象期間: {cycle.cycleStartDate} 〜 {cycle.cycleEndDate} ・ 0.125日刻み
                                </div>
                              </div>
                            )}
                            {cycleAddFormOpen === cycle.cycleStartDate && (
                              <div className="px-4 py-3 border-b border-[var(--pr4-border)] bg-emerald-50/30 dark:bg-emerald-950/10">
                                <div className="flex items-end gap-2 flex-wrap">
                                  <div>
                                    <Label className="text-[10px] text-[var(--ink-50)]">取得日</Label>
                                    <DateInput
                                      value={cycleAddForm.recordDate}
                                      onChange={(v) => setCycleAddForm({ ...cycleAddForm, recordDate: v })}
                                      enableWareki
                                      className="h-7 text-xs w-[160px]"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[10px] text-[var(--ink-50)]">日数</Label>
                                    <Input
                                      type="number"
                                      step="0.5"
                                      min="0.5"
                                      value={cycleAddForm.days}
                                      onChange={(e) => setCycleAddForm({ ...cycleAddForm, days: parseFloat(e.target.value) || 0.5 })}
                                      className="h-7 w-20 text-right text-xs"
                                    />
                                  </div>
                                  <div className="flex-1 min-w-[120px]">
                                    <Label className="text-[10px] text-[var(--ink-50)]">備考</Label>
                                    <Input
                                      value={cycleAddForm.note}
                                      onChange={(e) => setCycleAddForm({ ...cycleAddForm, note: e.target.value })}
                                      placeholder="任意"
                                      className="h-7 text-xs"
                                    />
                                  </div>
                                  <Button
                                    size="sm"
                                    className="h-7 px-3 text-xs gap-1"
                                    onClick={() => saveCycleLeaveUsage(cycle.cycleStartDate, cycle.cycleEndDate)}
                                    disabled={createLeaveUsageMutation.isPending}
                                  >
                                    <Check className="h-3 w-3" />
                                    保存
                                  </Button>
                                </div>
                                <div className="text-[10px] text-[var(--ink-50)] mt-1.5">
                                  対象期間: {cycle.cycleStartDate} 〜 {cycle.cycleEndDate}
                                </div>
                              </div>
                            )}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-[var(--surface-2)]">
                                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "14%" }}>日付</th>
                                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "14%" }}>種別</th>
                                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "12%" }}>日数</th>
                                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]">理由</th>
                                  <th className="text-left px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "10%" }}>状態</th>
                                  <th className="text-right px-4 py-2 text-[10px] font-semibold text-[var(--ink-50)] uppercase tracking-wider border-b border-[var(--pr4-border)]" style={{ width: "10%" }}>操作</th>
                                </tr>
                              </thead>
                              <tbody>
                                {cycleUsages.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-[var(--ink-50)] italic">
                                      このサイクルの履歴はありません
                                    </td>
                                  </tr>
                                )}
                                {cycleUsages.map((u) => {
                                  const isVoided = !!u.isVoided;
                                  const isAdj = u.recordType === "adjustment";
                                  const isIncrease = isAdj && u.days < 0;
                                  const displayDate = u.recordDate || u.startDate;
                                  const daysStr = isAdj
                                    ? (isIncrease ? `+${Math.abs(u.days).toFixed(1)}` : `−${Math.abs(u.days).toFixed(1)}`)
                                    : u.days.toFixed(1);
                                  return (
                                    <tr key={u.id} className={`border-b border-[var(--pr4-border)] last:border-b-0 ${isVoided ? "text-[var(--ink-35)]" : ""}`}>
                                      <td className="px-4 py-2.5">
                                        <span className={`font-mono text-xs ${isVoided ? "line-through text-[var(--ink-35)]" : "text-[var(--ink)]"}`}>{displayDate}</span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isVoided ? (
                                          <Badge variant="voided" className="text-[10px]">{isAdj ? (isIncrease ? "補正（増）" : "補正（減）") : "取得"}</Badge>
                                        ) : (
                                          <Badge variant={isAdj ? (isIncrease ? "success" : "danger") : "neut"} className="text-[10px]">
                                            <span className="w-1 h-1 rounded-full bg-current mr-1" />
                                            {isAdj ? (isIncrease ? "補正（増）" : "補正（減）") : "取得"}
                                          </Badge>
                                        )}
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`text-xs font-semibold ${
                                          isVoided ? "line-through text-[var(--ink-35)]"
                                          : isAdj && isIncrease ? "text-[var(--green)]"
                                          : isAdj ? "text-[var(--red)]"
                                          : "text-[var(--ink)]"
                                        }`}>{daysStr}</span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        <span className={`text-xs ${isVoided ? "line-through text-[var(--ink-35)]" : "text-[var(--ink-70)]"}`}>{u.reason || u.note || "-"}</span>
                                      </td>
                                      <td className="px-4 py-2.5">
                                        {isVoided ? <Badge variant="voided" className="text-[10px]">解除済</Badge> : <Badge variant="neut" className="text-[10px]">有効</Badge>}
                                      </td>
                                      <td className="px-4 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          {!isVoided && (
                                            <Button
                                              size="icon"
                                              variant="ghost"
                                              className="h-6 w-6 text-[var(--ink-50)] hover:text-amber-600 hover:bg-amber-50"
                                              title="解除（論理削除）"
                                              onClick={() => { setVoidTarget(u); setVoidDialogOpen(true); }}
                                            >
                                              <Ban className="h-3 w-3" />
                                            </Button>
                                          )}
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-6 w-6 text-[var(--ink-50)] hover:text-red-600 hover:bg-red-50"
                                            title="削除"
                                            disabled={deleteLeaveUsageMutation.isPending}
                                            onClick={() => handleDeleteLeaveUsage(u.id)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── 特別休暇 ─── */}
      <Collapsible open={specialLeaveOpen} onOpenChange={setSpecialLeaveOpen}>
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CollapsibleTrigger asChild>
              <button type="button" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                <Gift className="h-4 w-4 text-purple-500" />
                特別休暇
                <span className="text-xs font-normal text-muted-foreground">
                  {(specialLeavesData ?? []).length}件
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                setSpecialLeaveOpen(true);
                setShowAddSpecialLeave(!showAddSpecialLeave);
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </CardTitle>
        </CardHeader>
        <CollapsibleContent>
        <CardContent className="pt-0">
          {/* 追加フォーム */}
          {showAddSpecialLeave && (
            <div className="rounded-md bg-purple-50/50 dark:bg-purple-950/10 border border-purple-200 dark:border-purple-800 p-3 mb-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div>
                  <Label className="text-xs">種別</Label>
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={newSpecialLeave.leaveType}
                    onChange={(e) => setNewSpecialLeave({ ...newSpecialLeave, leaveType: e.target.value })}
                  >
                    <option value="慶弔休暇">慶弔休暇</option>
                    <option value="結婚休暇">結婚休暇</option>
                    <option value="忌引休暇">忌引休暇</option>
                    <option value="産前産後休暇">産前産後休暇</option>
                    <option value="育児休暇">育児休暇</option>
                    <option value="介護休暇">介護休暇</option>
                    <option value="裁判員休暇">裁判員休暇</option>
                    <option value="その他">その他</option>
                  </select>
                </div>
                <div>
                  <Label className="text-xs">開始日</Label>
                  <DateInput className="h-8 text-xs" value={newSpecialLeave.startDate}
                    onChange={(v) => setNewSpecialLeave({ ...newSpecialLeave, startDate: v })} />
                </div>
                <div>
                  <Label className="text-xs">終了日</Label>
                  <DateInput className="h-8 text-xs" value={newSpecialLeave.endDate}
                    onChange={(v) => setNewSpecialLeave({ ...newSpecialLeave, endDate: v })} />
                </div>
                <div>
                  <Label className="text-xs">日数</Label>
                  <Input type="number" step="0.5" min="0.5" className="h-8 text-xs" value={newSpecialLeave.days}
                    onChange={(e) => setNewSpecialLeave({ ...newSpecialLeave, days: parseFloat(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label className="text-xs">理由</Label>
                  <Input className="h-8 text-xs" placeholder="任意" value={newSpecialLeave.reason}
                    onChange={(e) => setNewSpecialLeave({ ...newSpecialLeave, reason: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs"
                  disabled={!newSpecialLeave.startDate || !newSpecialLeave.endDate || createSpecialLeaveMutation.isPending}
                  onClick={() => createSpecialLeaveMutation.mutate({
                    employeeId: id, ...newSpecialLeave,
                  })}>
                  {createSpecialLeaveMutation.isPending ? "登録中..." : "登録"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddSpecialLeave(false)}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {/* 一覧 */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="py-2 font-medium text-xs">種別</th>
                  <th className="py-2 font-medium text-xs">期間</th>
                  <th className="py-2 font-medium text-xs text-right">日数</th>
                  <th className="py-2 font-medium text-xs">理由</th>
                  <th className="py-2 font-medium text-xs text-right" />
                </tr>
              </thead>
              <tbody>
                {(!specialLeavesData || specialLeavesData.length === 0) && (
                  <tr><td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">特別休暇の記録なし</td></tr>
                )}
                {[...(specialLeavesData ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((sl) => (
                  <tr key={sl.id} className="border-b">
                    <td className="py-2">
                      <Badge variant="outline" className="text-xs px-1.5 py-0 border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
                        {sl.leaveType}
                      </Badge>
                    </td>
                    <td className="py-2 text-xs tabular-nums text-muted-foreground">
                      {sl.startDate} 〜 {sl.endDate}
                    </td>
                    <td className="py-2 text-right tabular-nums font-medium">{Number(sl.days).toFixed(2)}日</td>
                    <td className="py-2 text-muted-foreground text-xs max-w-[180px] truncate">{sl.reason || "-"}</td>
                    <td className="py-2 text-right">
                      <Button size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        onClick={() => { if (window.confirm("この特別休暇を削除しますか？")) deleteSpecialLeaveMutation.mutate(sl.id); }}
                        disabled={deleteSpecialLeaveMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
        </CollapsibleContent>
      </Card>
      </Collapsible>

      {/* 残業時間 */}
      <Card className={`border ${
        overtimeAlerts.length > 0 && overtimeAlerts.some(a => a.severity === "danger")
          ? "border-red-200 dark:border-red-800"
          : overtimeAlerts.length > 0
          ? "border-amber-200 dark:border-amber-800"
          : ""
      }`}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Clock className={`h-4 w-4 ${overtimeAlerts.length > 0 ? "text-red-500" : "text-amber-500"}`} />
            残業時間（月別・{currentYear}年度）
            {overtimeAlerts.length > 0 && (
              <Badge
                variant={overtimeAlerts.some(a => a.severity === "danger") ? "destructive" : "outline"}
                className="text-xs ml-auto"
              >
                {overtimeAlerts.length}件のアラート
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-4 mt-2 text-sm">
            <span>
              合計:{" "}
              <strong className={`tabular-nums ${
                totalOvertime > 360 ? "text-red-600 dark:text-red-400" : 
                totalOvertime > 300 ? "text-amber-600 dark:text-amber-400" : ""
              }`}>
                {totalOvertime.toFixed(2)}h
              </strong>
              {totalOvertime > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  / 360h上限（{((totalOvertime / 360) * 100).toFixed(2)}%）
                </span>
              )}
            </span>
            <span>
              平均: <strong className="tabular-nums">{avgOvertime.toFixed(2)}h</strong>
            </span>
          </div>
          {/* Year progress bar */}
          {totalOvertime > 0 && (
            <div className="mt-2">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalOvertime > 360 ? "bg-red-500" : totalOvertime > 300 ? "bg-amber-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min(100, (totalOvertime / 360) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {/* ── 凡例（レジェンド） ── */}
          <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border/50">
            <div className="text-xs font-medium text-muted-foreground mb-2">凡例（36協定基準）</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <div className="text-xs text-muted-foreground font-medium">残業時間（月単位）</div>
              <div className="text-xs text-muted-foreground font-medium">深夜残業（22:00〜5:00）</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-6 rounded-sm bg-blue-400" />
                  <span className="text-xs text-muted-foreground">適正 （0〜35h）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-6 rounded-sm bg-amber-400" />
                  <span className="text-xs text-muted-foreground">警告 （35h超〜45h）上限接近</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-6 rounded-sm bg-red-500" />
                  <span className="text-xs text-muted-foreground">違反 （45h超）36協定原則上限超過</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 pl-8 leading-relaxed">
                  ├ 80h超：過労死ライン・産業医面談勧奨<br />
                  └ 100h超：産業医面談義務（安衛法66条の8）
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-6 rounded-sm bg-purple-500" />
                  <span className="text-xs text-muted-foreground">深夜残業時間</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  ※ 22:00〜翌5:00の時間帯<br />
                  ※ 割増率 50%以上（深夜25%＋時間外25%）
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-4 rounded-sm bg-orange-500" />
                  <span className="text-xs text-muted-foreground">法定休日出勤（回数 / 時間）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-2.5 w-4 rounded-sm bg-teal-500" />
                  <span className="text-xs text-muted-foreground">法定外休日出勤（回数 / 時間）</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  ※ 法定休日：労基法35条による週休日（割増率35%以上）<br />
                  ※ 法定外休日：会社所定の休日（割増率25%以上）
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="overtime-table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">月</th>
                  <th className="pb-2 font-medium text-right">残業</th>
                  <th className="pb-2 font-medium pl-2" style={{minWidth: '160px'}}>残業バー</th>
                  <th className="pb-2 font-medium text-right">深夜</th>
                  <th className="pb-2 font-medium pl-2" style={{minWidth: '80px'}}>深夜バー</th>
                  <th className="pb-2 font-medium text-center" style={{minWidth: '80px'}}>法定休日</th>
                  <th className="pb-2 font-medium text-center" style={{minWidth: '80px'}}>法定外休日</th>
                  <th className="pb-2 font-medium text-right">判定</th>
                  <th className="pb-2 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS_FY.map((m) => {
                  const ot = overtimeMap.get(m);
                  const isEditing = editingMonth === m;
                  const hours = isEditing ? parseOT(editOT.overtimeHours) : (ot?.overtimeHours ?? 0);
                  const lateNight = isEditing ? parseOT(editOT.lateNightOvertime) : (ot?.lateNightOvertime ?? 0);
                  const hwLegal = isEditing ? parseOT(editOT.holidayWorkLegal) : (ot?.holidayWorkLegal ?? 0);
                  const hwNonLegal = isEditing ? parseOT(editOT.holidayWorkNonLegal) : (ot?.holidayWorkNonLegal ?? 0);
                  const hwLegalCount = isEditing ? parseOTInt(editOT.holidayWorkLegalCount) : (ot?.holidayWorkLegalCount ?? 0);
                  const hwNonLegalCount = isEditing ? parseOTInt(editOT.holidayWorkNonLegalCount) : (ot?.holidayWorkNonLegalCount ?? 0);
                  // 3-level color aligned with backend alert severity
                  const getOvertimeColor = (h: number) => {
                    if (h > 45) return { bar: "bg-red-500", text: "text-red-600 dark:text-red-400 font-semibold", label: "違反", badge: "destructive" as const };
                    if (h > 35) return { bar: "bg-amber-400", text: "text-amber-600 dark:text-amber-500", label: "警告", badge: "outline" as const };
                    return { bar: "bg-blue-400", text: "", label: "", badge: "outline" as const };
                  };
                  const otColor = getOvertimeColor(hours);
                  // Bar width: 100h = full width for regular overtime
                  const otBarWidth = hours > 0 ? Math.min(100, (hours / 100) * 100) : 0;
                  // Bar width for late night: 40h = full width
                  const lnBarWidth = lateNight > 0 ? Math.min(100, (lateNight / 40) * 100) : 0;
                  return (
                    <tr key={m} className="border-b">
                      <td className="py-2 font-medium">{m}月</td>
                      {isEditing ? (
                        <>
                          <td className="py-1 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                value={editOT.overtimeHours}
                                onChange={(e) =>
                                  setEditOT({ ...editOT, overtimeHours: e.target.value })
                                }
                                className={`h-7 w-20 text-right ${
                                  parseOT(editOT.overtimeHours) > 45
                                    ? "border-red-500 focus-visible:ring-red-500"
                                    : parseOT(editOT.overtimeHours) > 35
                                    ? "border-amber-400 focus-visible:ring-amber-400"
                                    : ""
                                }`}
                                data-testid={`input-overtime-hours-${m}`}
                              />
                              {parseOT(editOT.overtimeHours) > 45 && (
                                <Badge variant="destructive" className="text-xs px-1 py-0" data-testid={`badge-overtime-danger-${m}`}>
                                  違反（45h超）
                                </Badge>
                              )}
                              {parseOT(editOT.overtimeHours) > 35 && parseOT(editOT.overtimeHours) <= 45 && (
                                <Badge variant="outline" className="text-xs px-1 py-0 border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-400">
                                  警告（36協定上限接近）
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="py-1 px-2" />{/* 残業バー空欄 */}
                          <td className="py-1 text-right">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              value={editOT.lateNightOvertime}
                              onChange={(e) =>
                                setEditOT({ ...editOT, lateNightOvertime: e.target.value })
                              }
                              className="h-7 w-20 text-right ml-auto"
                              data-testid={`input-late-night-overtime-${m}`}
                            />
                          </td>
                          <td className="py-1 px-2" />{/* 深夜バー空欄 */}
                          {/* 法定休日: 回数 + 時間 */}
                          <td className="py-1">
                            <div className="flex items-center gap-1 justify-center">
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                value={editOT.holidayWorkLegalCount}
                                onChange={(e) =>
                                  setEditOT({ ...editOT, holidayWorkLegalCount: e.target.value })
                                }
                                className="h-7 w-12 text-right"
                                data-testid={`input-hw-legal-count-${m}`}
                              />
                              <span className="text-xs text-muted-foreground">回</span>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                value={editOT.holidayWorkLegal}
                                onChange={(e) =>
                                  setEditOT({ ...editOT, holidayWorkLegal: e.target.value })
                                }
                                className="h-7 w-14 text-right"
                                data-testid={`input-hw-legal-hours-${m}`}
                              />
                              <span className="text-xs text-muted-foreground">h</span>
                            </div>
                          </td>
                          {/* 法定外休日: 回数 + 時間 */}
                          <td className="py-1">
                            <div className="flex items-center gap-1 justify-center">
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                value={editOT.holidayWorkNonLegalCount}
                                onChange={(e) =>
                                  setEditOT({ ...editOT, holidayWorkNonLegalCount: e.target.value })
                                }
                                className="h-7 w-12 text-right"
                                data-testid={`input-hw-nonlegal-count-${m}`}
                              />
                              <span className="text-xs text-muted-foreground">回</span>
                              <Input
                                type="number"
                                step="0.5"
                                min="0"
                                value={editOT.holidayWorkNonLegal}
                                onChange={(e) =>
                                  setEditOT({ ...editOT, holidayWorkNonLegal: e.target.value })
                                }
                                className="h-7 w-14 text-right"
                                data-testid={`input-hw-nonlegal-hours-${m}`}
                              />
                              <span className="text-xs text-muted-foreground">h</span>
                            </div>
                          </td>
                          <td className="py-1 text-right" />{/* 判定空欄 */}
                          <td className="py-1 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                onClick={saveOvertimeRow}
                                disabled={upsertOvertimeMutation.isPending}
                                data-testid={`button-save-overtime-${m}`}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => setEditingMonth(null)}
                                data-testid={`button-cancel-overtime-${m}`}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          {/* 残業時間 */}
                          <td className={`py-2 text-right tabular-nums ${otColor.text}`}>
                            {ot ? `${hours.toFixed(2)}h` : "-"}
                          </td>
                          {/* 残業バー */}
                          <td className="py-2 pl-2">
                            {ot && hours > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="relative h-4 flex-1 rounded bg-muted/60 overflow-hidden" style={{minWidth: '100px'}}>
                                  {/* 45h threshold marker */}
                                  <div className="absolute top-0 h-full border-l-2 border-dashed border-yellow-500/60 z-10" style={{left: '45%'}} />
                                  {/* 80h threshold marker */}
                                  <div className="absolute top-0 h-full border-l-2 border-dashed border-red-500/60 z-10" style={{left: '80%'}} />
                                  {/* Overtime bar */}
                                  <div
                                    className={`h-full rounded transition-all ${otColor.bar}`}
                                    style={{ width: `${otBarWidth}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          {/* 深夜時間 */}
                          <td className="py-2 text-right tabular-nums text-purple-600 dark:text-purple-400">
                            {ot ? `${lateNight.toFixed(2)}h` : "-"}
                          </td>
                          {/* 深夜バー */}
                          <td className="py-2 pl-2">
                            {ot && lateNight > 0 && (
                              <div className="flex items-center gap-1.5">
                                <div className="relative h-4 flex-1 rounded bg-muted/60 overflow-hidden" style={{minWidth: '50px'}}>
                                  <div
                                    className="h-full rounded transition-all bg-purple-500"
                                    style={{ width: `${lnBarWidth}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </td>
                          {/* 法定休日出勤 */}
                          <td className="py-2 text-center tabular-nums">
                            {ot ? (
                              (hwLegalCount > 0 || hwLegal > 0) ? (
                                <span className="text-orange-600 dark:text-orange-400">
                                  {hwLegalCount}回 / {hwLegal.toFixed(2)}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )
                            ) : "-"}
                          </td>
                          {/* 法定外休日出勤 */}
                          <td className="py-2 text-center tabular-nums">
                            {ot ? (
                              (hwNonLegalCount > 0 || hwNonLegal > 0) ? (
                                <span className="text-teal-600 dark:text-teal-400">
                                  {hwNonLegalCount}回 / {hwNonLegal.toFixed(2)}h
                                </span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )
                            ) : "-"}
                          </td>
                          <td className="py-2 text-right">
                            {ot && otColor.label ? (
                              otColor.label === "違反" ? (
                                <Badge variant="destructive" className="text-xs">
                                  {otColor.label}
                                </Badge>
                              ) : otColor.label === "警告" ? (
                                <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                                  {otColor.label}
                                </Badge>
                              ) : null
                            ) : null}
                          </td>
                          <td className="py-2 text-right">
                            {ot ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => startEditMonth(m, ot)}
                                data-testid={`button-edit-overtime-${m}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                onClick={() => startEditMonth(m, undefined)}
                                data-testid={`button-add-overtime-${m}`}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── 退職処理ダイアログ ─── */}
      <Dialog open={retireDialogOpen} onOpenChange={setRetireDialogOpen}>
        <DialogContent data-testid="dialog-retire">
          <DialogHeader>
            <DialogTitle>退職処理</DialogTitle>
            <DialogDescription>
              {employee.name} さんの退職日を入力してください。退職処理を行うと、管理対象から除外されます。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="retire-date">
                退職日 <span className="text-destructive">＊</span>
              </Label>
              <DateInput
                id="retire-date"
                value={retireDate}
                onChange={(v) => setRetireDate(v)}
                data-testid="input-retire-date"
              />
              {retireDate && employee.joinDate && retireDate < employee.joinDate && (
                <p className="text-xs text-destructive flex items-center gap-1" data-testid="error-retire-date">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  退職日は入社日（{employee.joinDate}）より前に設定できません
                </p>
              )}
            </div>
            <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
              <div className="flex items-start gap-2">
                <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">注意事項</p>
                  <ul className="mt-1 text-xs space-y-0.5 list-disc list-inside">
                    <li>退職者はアラート・集計から除外されます</li>
                    <li>現在進行中の配属履歴が自動的に終了されます</li>
                    <li>社員データは元社員として保管されます</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRetireDialogOpen(false);
                setRetireDate("");
              }}
              data-testid="button-cancel-retire"
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={() => retireMutation.mutate(retireDate)}
              disabled={retireMutation.isPending || !retireDate || (!!employee.joinDate && !!retireDate && retireDate < employee.joinDate)}
              data-testid="button-confirm-retire"
            >
              {retireMutation.isPending ? "処理中..." : "退職処理を実行"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PR-4: 解除モーダル */}
      <VoidLeaveUsageDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        usage={voidTarget}
        employeeId={id}
        currentRemainingDays={paidLeave?.adjustedRemainingDays ?? 0}
      />
    </div>
  );
}
