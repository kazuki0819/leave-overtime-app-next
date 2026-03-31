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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useToast } from "@/hooks/use-toast";
import type { Employee, PaidLeave, MonthlyOvertime, EmployeeAlert, LeaveUsage, AssignmentHistory, SpecialLeave, HolidayWork } from "@/lib/schema";
import { calcLeaveDeadline, calcExpiryRisk, calcConsumptionPace, calcCarryoverUtil, calcAutoGrantedDays, calcAutoCarryoverDays, calcAutoExpiredDays, type LeaveDeadlineInfo, type ExpiryRiskInfo, type ConsumptionPaceInfo, type CarryoverUtilInfo } from "@/lib/leave-calc";
import { useFiscalYear } from "@/hooks/use-fiscal-year";
import { FiscalYearSelector } from "@/components/fiscal-year-selector";

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

  // Feature B: Leave usage history state
  const [showAddLeaveUsage, setShowAddLeaveUsage] = useState(false);
  const [newLeaveUsage, setNewLeaveUsage] = useState({
    startDate: "",
    endDate: "",
    days: 1,
    reason: "",
  });

  // Special leave state
  const [showAddSpecialLeave, setShowAddSpecialLeave] = useState(false);
  const [newSpecialLeave, setNewSpecialLeave] = useState({
    startDate: "",
    endDate: "",
    days: 1,
    leaveType: "慶弔休暇",
    reason: "",
  });

  // Memo inline edit state
  const [isMemoEditing, setIsMemoEditing] = useState(false);
  const [memoText, setMemoText] = useState("");

  // Holiday work state
  const [showAddHolidayWork, setShowAddHolidayWork] = useState(false);
  const [newHolidayWork, setNewHolidayWork] = useState({
    workDate: "",
    hours: 8,
    holidayType: "法定休日",
  });

  // Manual override state for auto-calculated fields
  const [manualOverrides, setManualOverrides] = useState<{
    grantedDays: boolean;
    carriedOverDays: boolean;
    expiredDays: boolean;
  }>({ grantedDays: false, carriedOverDays: false, expiredDays: false });

  // Retirement dialog state
  const [retireDialogOpen, setRetireDialogOpen] = useState(false);
  const [retireDate, setRetireDate] = useState("");

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

  const { fiscalYear } = useFiscalYear();

  const { data: paidLeave } = useQuery<PaidLeave | null>({
    queryKey: ["/api/paid-leaves", id, fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/paid-leaves/${id}?year=${fiscalYear}`);
      return res.json();
    },
  });

  // 前年度の有給データ（繰越計算用）
  const { data: prevYearLeave } = useQuery<PaidLeave | null>({
    queryKey: ["/api/paid-leaves", id, fiscalYear - 1],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/paid-leaves/${id}?year=${fiscalYear - 1}`);
      return res.json();
    },
  });

  const { data: overtimes } = useQuery<MonthlyOvertime[]>({
    queryKey: ["/api/monthly-overtimes", id, fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/monthly-overtimes?employeeId=${id}&year=${fiscalYear}`);
      return res.json();
    },
  });

  const { data: allAlerts } = useQuery<EmployeeAlert[]>({
    queryKey: ["/api/alerts", fiscalYear],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/alerts?year=${fiscalYear}`);
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
        fiscalYear,
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
        year: fiscalYear,
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
    mutationFn: async (data: { employeeId: string; startDate: string; endDate: string; days: number; reason: string }) => {
      const res = await apiRequest("POST", "/api/leave-usages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/leave-usages", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/paid-leaves"] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({ title: "有給使用を追加しました" });
      setShowAddLeaveUsage(false);
      setNewLeaveUsage({ startDate: "", endDate: "", days: 1, reason: "" });
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

  // Holiday work query
  const { data: holidayWorksData } = useQuery<HolidayWork[]>({
    queryKey: ["/api/holiday-works", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/holiday-works?employeeId=${id}`);
      return res.json();
    },
  });

  // Holiday work mutations
  const createHolidayWorkMutation = useMutation({
    mutationFn: async (data: { employeeId: string; workDate: string; hours: number; holidayType: string }) => {
      const res = await apiRequest("POST", "/api/holiday-works", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holiday-works", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      setShowAddHolidayWork(false);
      setNewHolidayWork({ workDate: "", hours: 8, holidayType: "法定休日" });
      toast({ title: "休日出勤を登録しました" });
    },
    onError: () => toast({ title: "登録に失敗しました", variant: "destructive" }),
  });

  const deleteHolidayWorkMutation = useMutation({
    mutationFn: async (hwId: number) => {
      const res = await apiRequest("DELETE", `/api/holiday-works/${hwId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/holiday-works", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/employee-summaries"] });
      toast({ title: "休日出勤を削除しました" });
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

  // 自動計算値
  const autoGrantedDays = useMemo(() => {
    if (!employee?.joinDate) return 0;
    return calcAutoGrantedDays(employee.joinDate, fiscalYear);
  }, [employee?.joinDate, fiscalYear]);

  const autoCarryoverDays = useMemo(() => {
    return calcAutoCarryoverDays(prevYearLeave?.remainingDays);
  }, [prevYearLeave?.remainingDays]);

  // 編集中の自動時効日数（編集フォームの繰越・消化値からリアルタイム計算）
  const autoExpiredDays = useMemo(() => {
    if (!isEditing) {
      return calcAutoExpiredDays(paidLeave?.carriedOverDays ?? 0, computedConsumedDays);
    }
    return calcAutoExpiredDays(editForm.carriedOverDays ?? 0, computedConsumedDays);
  }, [isEditing, editForm.carriedOverDays, computedConsumedDays, paidLeave?.carriedOverDays]);

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
      consumedDays: computedConsumedDays,
      remainingDays: paidLeave?.remainingDays ?? 0,
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
    updateEmpMutation.mutate({
      name: editForm.name,
      assignment: editForm.assignment,
      joinDate: editForm.joinDate,
      tenureMonths: editForm.tenureMonths,
    });
    updateLeaveMutation.mutate({
      grantedDays: editForm.grantedDays,
      carriedOverDays: editForm.carriedOverDays,
      consumedDays: computedConsumedDays,
      remainingDays: computedRemainingDays,
      expiredDays: editForm.expiredDays,
      usageRate: computedUsageRate,
    });
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

  // Feature B: save new leave usage
  const saveNewLeaveUsage = () => {
    if (!newLeaveUsage.startDate || !newLeaveUsage.endDate || newLeaveUsage.days <= 0) {
      toast({ title: "入力エラー", description: "開始日・終了日・日数は必須です", variant: "destructive" });
      return;
    }
    createLeaveUsageMutation.mutate({
      employeeId: id,
      startDate: newLeaveUsage.startDate,
      endDate: newLeaveUsage.endDate,
      days: newLeaveUsage.days,
      reason: newLeaveUsage.reason,
    });
  };

  // Feature B: delete leave usage with confirm
  const handleDeleteLeaveUsage = (usageId: number) => {
    if (!window.confirm("この有給使用を削除しますか？")) return;
    deleteLeaveUsageMutation.mutate(usageId);
  };

  // Feature B: sort leave usages descending by startDate
  const sortedLeaveUsages = useMemo(() => {
    return [...(leaveUsages ?? [])].sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
  }, [leaveUsages]);

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
          <FiscalYearSelector className="ml-auto" />
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
                  <Input
                    type="date"
                    value={editForm.joinDate ?? ""}
                    onChange={(e) => setEditForm({ ...editForm, joinDate: e.target.value })}
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

        {/* 有給休暇 */}
        <Card className={`border ${
          leaveAlerts.length > 0 && leaveAlerts.some(a => a.severity === "danger")
            ? "border-red-200 dark:border-red-800"
            : leaveAlerts.length > 0
            ? "border-amber-200 dark:border-amber-800"
            : ""
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Calendar className={`h-4 w-4 ${leaveAlerts.length > 0 ? "text-amber-500" : "text-emerald-500"}`} />
              有給休暇（{fiscalYear}年度）
              {leaveAlerts.length > 0 && (
                <Badge
                  variant={leaveAlerts.some(a => a.severity === "danger") ? "destructive" : "outline"}
                  className="text-xs ml-auto"
                >
                  {leaveAlerts.length}件のアラート
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <div className="space-y-3">
                {/* 自動計算フィールド: 付与日数・繰越日数・時効日数 */}
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

                  {/* 消化日数（有給取得履歴から自動算出・編集不可） */}
                  <div>
                    <Label className="text-xs flex items-center gap-1 mb-1">
                      <Calculator className="h-3 w-3 text-blue-500" />
                      消化日数
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 ml-auto flex items-center gap-0.5">
                        <Lock className="h-2.5 w-2.5" /> 取得履歴から自動算出
                      </span>
                    </Label>
                    <div
                      className="h-9 px-3 flex items-center justify-between rounded-md border bg-blue-50/50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800"
                      data-testid="auto-consumedDays"
                    >
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
                {/* 自動計算プレビュー */}
                <div className="rounded-md border bg-muted/30 px-3 py-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div className="text-xs text-muted-foreground col-span-2 font-medium mb-0.5">自動計算（読み取り専用）</div>
                  <div>
                    <span className="text-xs text-muted-foreground">残日数</span>
                    <div className="text-sm font-bold tabular-nums text-primary" data-testid="computed-remainingDays">
                      {computedRemainingDays}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">取得率</span>
                    <div className={`text-sm font-bold tabular-nums ${
                      computedUsageRate < 0.3
                        ? "text-red-600 dark:text-red-400"
                        : computedUsageRate < 0.7
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`} data-testid="computed-usageRate">
                      {(computedUsageRate * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div className="col-span-2 text-xs text-muted-foreground">
                    残日数 ＝ 付与 ＋ 繰越 − 消化 − 時効（最小0）
                  </div>
                </div>
                {/* 自動計算ロジック説明 */}
                <div className="rounded-md bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-[11px] text-blue-700 dark:text-blue-300 space-y-1">
                  <div className="font-medium flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    自動計算の根拠
                  </div>
                  <div>・付与日数: 労基法39条（入社6ヶ月後10日、以降勤続年数に応じ増加、最大20日）</div>
                  <div>・繰越日数: 労基法115条（2年時効、前年度残日数を繰越）</div>
                  <div>・消化日数: 有給取得履歴のdays合計（自動算出・編集不可）</div>
                  <div>・時効日数: 繰越分の未消化分（先入先出原則）</div>
                  <div>・残日数・取得率: 自動計算（編集不可）</div>
                  <div className="text-blue-600/70 dark:text-blue-400/70">付与・繰越・時効はクリックで手動上書き、リセットで自動値に復帰</div>
                </div>
              </div>
            ) : paidLeave ? (
              <div>
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">付与日数</dt>
                    <dd className="text-lg font-bold tabular-nums">{Number(paidLeave.grantedDays).toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">繰越日数</dt>
                    <dd className="text-lg font-bold tabular-nums">{Number(paidLeave.carriedOverDays).toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">消化日数</dt>
                    <dd className={`text-lg font-bold tabular-nums ${
                      paidLeave.consumedDays < 5 ? "text-red-600 dark:text-red-400" : ""
                    }`}>
                      {Number(paidLeave.consumedDays).toFixed(2)}
                      {paidLeave.consumedDays < 5 && (
                        <span className="text-xs font-normal ml-1 text-red-500">※5日未満</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">残日数</dt>
                    <dd className="text-lg font-bold tabular-nums text-primary">{Number(paidLeave.remainingDays).toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">時効日数</dt>
                    <dd className="text-lg font-bold tabular-nums">{Number(paidLeave.expiredDays).toFixed(2)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">取得率</dt>
                    <dd className={`text-lg font-bold tabular-nums ${
                      paidLeave.usageRate < 0.3
                        ? "text-red-600 dark:text-red-400"
                        : paidLeave.usageRate < 0.7
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}>
                      {(paidLeave.usageRate * 100).toFixed(2)}%
                    </dd>
                  </div>
                </dl>
                {/* 5-day progress bar */}
                <div className="mt-3 pt-3 border-t">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>年5日義務達成状況</span>
                    <span className="tabular-nums font-medium">
                      {Math.min(paidLeave.consumedDays, 5).toFixed(2)}/5.00日
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        paidLeave.consumedDays >= 5
                          ? "bg-emerald-500"
                          : paidLeave.consumedDays >= 3
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, (paidLeave.consumedDays / 5) * 100)}%` }}
                    />
                  </div>
                </div>

                {/* 期限・ペース情報 */}
                {deadline && deadline.paceStatus !== "not_eligible" && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5 mb-2">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">取得期限・ペース</span>
                      <Badge
                        variant={deadline.paceStatus === "overdue" || deadline.paceStatus === "danger" ? "destructive" : "outline"}
                        className={`text-xs ml-auto px-1.5 py-0 ${
                          deadline.paceStatus === "ok"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                            : deadline.paceStatus === "tight"
                            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                            : ""
                        }`}
                      >
                        {deadline.paceStatus === "ok" && "余裕あり"}
                        {deadline.paceStatus === "tight" && "やや注意"}
                        {deadline.paceStatus === "danger" && "ペース不足"}
                        {deadline.paceStatus === "overdue" && "期限超過"}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="text-muted-foreground">付与基準日</dt>
                        <dd className="font-medium tabular-nums">{deadline.currentGrantDate}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">義務期限</dt>
                        <dd className="font-medium tabular-nums">{deadline.obligationDeadline}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">期限まで</dt>
                        <dd className={`font-bold tabular-nums ${
                          deadline.daysUntilDeadline <= 30
                            ? "text-red-600 dark:text-red-400"
                            : deadline.daysUntilDeadline <= 90
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-foreground"
                        }`}>
                          {deadline.daysUntilDeadline > 0 ? `${deadline.daysUntilDeadline}日` : "期限超過"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">残り必要日数</dt>
                        <dd className={`font-bold tabular-nums ${
                          deadline.remainingObligation > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}>
                          {deadline.remainingObligation > 0
                            ? `あと${deadline.remainingObligation}日`
                            : <span className="inline-flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" />達成</span>
                          }
                        </dd>
                      </div>
                    </dl>
                    {/* Pace message */}
                    <div className={`mt-2 rounded px-2 py-1.5 text-xs ${
                      deadline.paceStatus === "ok"
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                        : deadline.paceStatus === "tight"
                        ? "bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                        : "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                    }`}>
                      {deadline.paceMessage}
                    </div>
                    {/* Legal info */}
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span>勤続 {deadline.tenureYears}年</span>
                      <span>法定付与 {deadline.legalGrantDays}日</span>
                    </div>
                  </div>
                )}
                {deadline && deadline.paceStatus === "not_eligible" && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{deadline.paceMessage}</span>
                    </div>
                  </div>
                )}

                {/* 健全性指標 */}
                {(expiryRisk || consumptionPace || carryoverUtil) && (
                  <div className="mt-3 pt-3 border-t">
                    <div className="flex items-center gap-1.5 mb-2">
                      <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">健全性指標</span>
                    </div>
                    <div className="space-y-2">
                      {/* 失効リスク */}
                      {expiryRisk && expiryRisk.riskLevel !== "none" && (
                        <div className={`rounded px-2.5 py-2 text-xs ${
                          expiryRisk.riskLevel === "high"
                            ? "bg-red-50 dark:bg-red-950/30"
                            : expiryRisk.riskLevel === "medium"
                            ? "bg-amber-50 dark:bg-amber-950/30"
                            : "bg-blue-50 dark:bg-blue-950/30"
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <Timer className="h-3 w-3 shrink-0" />
                            <span className="font-medium">失効リスク</span>
                            <Badge variant={expiryRisk.riskLevel === "high" ? "destructive" : "outline"} className="text-xs px-1 py-0 ml-auto">
                              {expiryRisk.riskLevel === "high" ? "高" : expiryRisk.riskLevel === "medium" ? "中" : "低"}
                            </Badge>
                          </div>
                          <p className={`mt-1 ${
                            expiryRisk.riskLevel === "high" ? "text-red-700 dark:text-red-400" :
                            expiryRisk.riskLevel === "medium" ? "text-amber-700 dark:text-amber-400" :
                            "text-blue-700 dark:text-blue-400"
                          }`}>
                            {expiryRisk.message}
                          </p>
                        </div>
                      )}
                      {expiryRisk && expiryRisk.riskLevel === "none" && (
                        <div className="rounded px-2.5 py-2 text-xs bg-emerald-50 dark:bg-emerald-950/30">
                          <div className="flex items-center gap-1.5">
                            <Timer className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-medium text-emerald-700 dark:text-emerald-400">失効リスクなし</span>
                          </div>
                        </div>
                      )}

                      {/* 取得ペース */}
                      {consumptionPace && consumptionPace.paceLevel !== "not_applicable" && (
                        <div className={`rounded px-2.5 py-2 text-xs ${
                          consumptionPace.paceLevel === "very_slow"
                            ? "bg-red-50 dark:bg-red-950/30"
                            : consumptionPace.paceLevel === "slow"
                            ? "bg-amber-50 dark:bg-amber-950/30"
                            : "bg-emerald-50 dark:bg-emerald-950/30"
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className="h-3 w-3 shrink-0" />
                            <span className="font-medium">取得ペース</span>
                            <Badge variant="outline" className={`text-xs px-1 py-0 ml-auto ${
                              consumptionPace.paceLevel === "good"
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : consumptionPace.paceLevel === "slow"
                                ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                : "border-red-300 bg-red-100 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}>
                              {consumptionPace.paceLevel === "good" ? "良好" : consumptionPace.paceLevel === "slow" ? "遅れ" : "不足"}
                            </Badge>
                          </div>
                          <p className={`mt-1 ${
                            consumptionPace.paceLevel === "good" ? "text-emerald-700 dark:text-emerald-400" :
                            consumptionPace.paceLevel === "slow" ? "text-amber-700 dark:text-amber-400" :
                            "text-red-700 dark:text-red-400"
                          }`}>
                            {consumptionPace.message}
                          </p>
                        </div>
                      )}

                      {/* 繰越活用度 */}
                      {carryoverUtil && carryoverUtil.utilLevel !== "not_applicable" && (
                        <div className={`rounded px-2.5 py-2 text-xs ${
                          carryoverUtil.utilLevel === "danger"
                            ? "bg-orange-50 dark:bg-orange-950/30"
                            : carryoverUtil.utilLevel === "warning"
                            ? "bg-amber-50 dark:bg-amber-950/30"
                            : "bg-emerald-50 dark:bg-emerald-950/30"
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3 shrink-0" />
                            <span className="font-medium">繰越活用度</span>
                            <Badge variant="outline" className={`text-xs px-1 py-0 ml-auto ${
                              carryoverUtil.utilLevel === "good"
                                ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                                : carryoverUtil.utilLevel === "warning"
                                ? "border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                                : "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                            }`}>
                              {carryoverUtil.utilLevel === "good" ? "良好" : carryoverUtil.utilLevel === "warning" ? "注意" : "危険"}
                            </Badge>
                          </div>
                          <p className={`mt-1 ${
                            carryoverUtil.utilLevel === "good" ? "text-emerald-700 dark:text-emerald-400" :
                            carryoverUtil.utilLevel === "warning" ? "text-amber-700 dark:text-amber-400" :
                            "text-orange-700 dark:text-orange-400"
                          }`}>
                            {carryoverUtil.message}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
                            {fiscalYear}年度の有給付与対象です（法定 {autoGrantedDays}日）
                          </p>
                          <p className="mt-1 text-blue-700/80 dark:text-blue-400/70">
                            有給データが未登録です。下のボタンで自動計算値をもとにデータを作成できます。
                          </p>
                        </div>
                      </div>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">付与日数（法定）</dt>
                        <dd className="text-lg font-bold tabular-nums">{autoGrantedDays}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">繰越日数</dt>
                        <dd className="text-lg font-bold tabular-nums">{autoCarryoverDays}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">消化日数</dt>
                        <dd className="text-lg font-bold tabular-nums">0</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">残日数</dt>
                        <dd className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{autoGrantedDays + autoCarryoverDays}</dd>
                      </div>
                    </dl>
                    <Button
                      size="sm"
                      onClick={() => {
                        const expiredDays = calcAutoExpiredDays(autoCarryoverDays, 0);
                        updateLeaveMutation.mutate({
                          grantedDays: autoGrantedDays,
                          carriedOverDays: autoCarryoverDays,
                          consumedDays: 0,
                          expiredDays: expiredDays,
                          remainingDays: Math.max(0, autoGrantedDays + autoCarryoverDays - expiredDays),
                          usageRate: 0,
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
      </div>

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
            残業時間（月別・{fiscalYear}年度）
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
                  <th className="pb-2 font-medium text-right">深夜</th>
                  <th className="pb-2 font-medium text-center" style={{minWidth: '80px'}}>法定休日</th>
                  <th className="pb-2 font-medium text-center" style={{minWidth: '80px'}}>法定外休日</th>
                  <th className="pb-2 font-medium pl-2" style={{minWidth: '160px'}}>残業バー</th>
                  <th className="pb-2 font-medium pl-2" style={{minWidth: '80px'}}>深夜バー</th>
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
                          <td className="py-1 px-2" colSpan={2} />
                          <td className="py-1 text-right" />
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
                          <td className={`py-2 text-right tabular-nums ${otColor.text}`}>
                            {ot ? `${hours.toFixed(2)}h` : "-"}
                          </td>
                          <td className="py-2 text-right tabular-nums text-purple-600 dark:text-purple-400">
                            {ot ? `${lateNight.toFixed(2)}h` : "-"}
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
                          {/* Regular overtime bar */}
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
                          {/* Late night overtime bar */}
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

      {/* ─── 配属履歴 ─── */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Building2 className="h-4 w-4 text-indigo-500" />
            配属履歴
            <span className="text-xs font-normal text-muted-foreground">
              {sortedHistories.length}件
            </span>
            {!isRetired && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 text-xs gap-1"
                onClick={() => {
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
                      <Input
                        type="date"
                        value={historyForm.startDate}
                        onChange={(e) => setHistoryForm({ ...historyForm, startDate: e.target.value })}
                        className="h-7 text-xs"
                        required
                        data-testid="input-new-history-start-date"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="date"
                        value={historyForm.endDate}
                        onChange={(e) => setHistoryForm({ ...historyForm, endDate: e.target.value })}
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
                            <Input
                              type="date"
                              value={historyForm.startDate}
                              onChange={(e) => setHistoryForm({ ...historyForm, startDate: e.target.value })}
                              className="h-7 text-xs"
                              data-testid={`input-edit-history-start-${h.id}`}
                            />
                          </td>
                          <td className="py-1 pr-2">
                            <Input
                              type="date"
                              value={historyForm.endDate}
                              onChange={(e) => setHistoryForm({ ...historyForm, endDate: e.target.value })}
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
      </Card>

      {/* ─── Feature B: 有給使用履歴 ─── */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="h-4 w-4 text-emerald-500" />
            有給使用履歴
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs gap-1"
              onClick={() => {
                setShowAddLeaveUsage(true);
                setNewLeaveUsage({ startDate: "", endDate: "", days: 1, reason: "" });
              }}
              data-testid="button-add-leave-usage"
            >
              <Plus className="h-3.5 w-3.5" />
              追加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="leave-usage-table">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 font-medium">開始日</th>
                  <th className="pb-2 font-medium">終了日</th>
                  <th className="pb-2 font-medium text-right">日数</th>
                  <th className="pb-2 font-medium">理由</th>
                  <th className="pb-2 font-medium text-right">削除</th>
                </tr>
              </thead>
              <tbody>
                {/* Add row */}
                {showAddLeaveUsage && (
                  <tr className="border-b bg-muted/30">
                    <td className="py-1 pr-2">
                      <Input
                        type="date"
                        value={newLeaveUsage.startDate}
                        onChange={(e) => setNewLeaveUsage({ ...newLeaveUsage, startDate: e.target.value })}
                        className="h-7 text-xs"
                        required
                        data-testid="input-new-leave-start-date"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="date"
                        value={newLeaveUsage.endDate}
                        onChange={(e) => setNewLeaveUsage({ ...newLeaveUsage, endDate: e.target.value })}
                        className="h-7 text-xs"
                        required
                        data-testid="input-new-leave-end-date"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={newLeaveUsage.days}
                        onChange={(e) => setNewLeaveUsage({ ...newLeaveUsage, days: parseFloat(e.target.value) || 0.5 })}
                        className="h-7 w-20 text-right ml-auto text-xs"
                        required
                        data-testid="input-new-leave-days"
                      />
                    </td>
                    <td className="py-1 pr-2">
                      <Input
                        value={newLeaveUsage.reason}
                        onChange={(e) => setNewLeaveUsage({ ...newLeaveUsage, reason: e.target.value })}
                        placeholder="理由（任意）"
                        className="h-7 text-xs"
                        data-testid="input-new-leave-reason"
                      />
                    </td>
                    <td className="py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={saveNewLeaveUsage}
                          disabled={createLeaveUsageMutation.isPending}
                          data-testid="button-save-new-leave-usage"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAddLeaveUsage(false)}
                          data-testid="button-cancel-new-leave-usage"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Existing rows */}
                {sortedLeaveUsages.length === 0 && !showAddLeaveUsage && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                      有給使用履歴がありません
                    </td>
                  </tr>
                )}
                {sortedLeaveUsages.map((usage) => (
                  <tr key={usage.id} className="border-b" data-testid={`row-leave-usage-${usage.id}`}>
                    <td className="py-2 tabular-nums">{usage.startDate}</td>
                    <td className="py-2 tabular-nums">{usage.endDate}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{Number(usage.days).toFixed(2)}日</td>
                    <td className="py-2 text-muted-foreground text-xs max-w-[180px] truncate">
                      {usage.reason || "-"}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteLeaveUsage(usage.id)}
                        disabled={deleteLeaveUsageMutation.isPending}
                        data-testid={`button-delete-leave-usage-${usage.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── 特別休暇 ─── */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Gift className="h-4 w-4 text-purple-500" />
            特別休暇
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => setShowAddSpecialLeave(!showAddSpecialLeave)}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </CardTitle>
        </CardHeader>
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
                  <Input type="date" className="h-8 text-xs" value={newSpecialLeave.startDate}
                    onChange={(e) => setNewSpecialLeave({ ...newSpecialLeave, startDate: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">終了日</Label>
                  <Input type="date" className="h-8 text-xs" value={newSpecialLeave.endDate}
                    onChange={(e) => setNewSpecialLeave({ ...newSpecialLeave, endDate: e.target.value })} />
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
      </Card>

      {/* ─── 休日出勤 ─── */}
      <Card className="border">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Briefcase className="h-4 w-4 text-orange-500" />
            休日出勤
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-xs ml-auto"
              onClick={() => setShowAddHolidayWork(!showAddHolidayWork)}
            >
              <Plus className="h-3 w-3 mr-1" />
              追加
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {showAddHolidayWork && (
            <div className="rounded-md bg-orange-50/50 dark:bg-orange-950/10 border border-orange-200 dark:border-orange-800 p-3 mb-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">休日出勤日</Label>
                  <Input type="date" className="h-8 text-xs" value={newHolidayWork.workDate}
                    onChange={(e) => setNewHolidayWork({ ...newHolidayWork, workDate: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">時間</Label>
                  <Input type="number" step="0.5" min="0.5" className="h-8 text-xs" value={newHolidayWork.hours}
                    onChange={(e) => setNewHolidayWork({ ...newHolidayWork, hours: parseFloat(e.target.value) || 8 })} />
                </div>
                <div>
                  <Label className="text-xs">区分</Label>
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={newHolidayWork.holidayType}
                    onChange={(e) => setNewHolidayWork({ ...newHolidayWork, holidayType: e.target.value })}
                  >
                    <option value="法定休日">法定休日</option>
                    <option value="法定外休日">法定外休日</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" className="h-7 text-xs"
                  disabled={!newHolidayWork.workDate || createHolidayWorkMutation.isPending}
                  onClick={() => createHolidayWorkMutation.mutate({
                    employeeId: id, ...newHolidayWork,
                  })}>
                  {createHolidayWorkMutation.isPending ? "登録中..." : "登録"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddHolidayWork(false)}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                  <th className="py-2 font-medium text-xs">日付</th>
                  <th className="py-2 font-medium text-xs text-right">時間</th>
                  <th className="py-2 font-medium text-xs">区分</th>
                  <th className="py-2 font-medium text-xs text-right" />
                </tr>
              </thead>
              <tbody>
                {(!holidayWorksData || holidayWorksData.length === 0) && (
                  <tr><td colSpan={4} className="py-4 text-center text-sm text-muted-foreground">休日出勤の記録なし</td></tr>
                )}
                {[...(holidayWorksData ?? [])].sort((a, b) => b.workDate.localeCompare(a.workDate)).map((hw) => (
                  <tr key={hw.id} className="border-b">
                    <td className="py-2 text-xs tabular-nums">{hw.workDate}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{Number(hw.hours).toFixed(2)}h</td>
                    <td className="py-2">
                      <Badge variant="outline" className={`text-xs px-1.5 py-0 ${
                        hw.holidayType === "法定休日"
                          ? "border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/40 dark:text-red-400"
                          : "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                      }`}>
                        {hw.holidayType}
                      </Badge>
                    </td>
                    <td className="py-2 text-right">
                      <Button size="icon" variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                        onClick={() => { if (window.confirm("この休日出勤を削除しますか？")) deleteHolidayWorkMutation.mutate(hw.id); }}
                        disabled={deleteHolidayWorkMutation.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
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
              <Input
                id="retire-date"
                type="date"
                value={retireDate}
                onChange={(e) => setRetireDate(e.target.value)}
                min={employee.joinDate || undefined}
                required
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
    </div>
  );
}
