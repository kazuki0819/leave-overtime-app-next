"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Database,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FooterAttribution } from "@/components/FooterAttribution";

type BackupInfo = {
  dbPath: string;
  dbSize: number;
  lastModified: string;
  backupDir: string;
  backups: { filename: string; date: string; size: number }[];
};

export default function Settings() {
  const { toast } = useToast();

  const { data: backupInfo, isLoading: backupLoading } = useQuery<BackupInfo>({
    queryKey: ["/api/backup/info"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/backup/info");
      return res.json();
    },
  });

  const backupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/backup/create");
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "バックアップ完了",
        description: `${data.filename} を作成しました（${formatBytes(data.size)}）`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/backup/info"] });
    },
    onError: (e) => {
      toast({ title: "バックアップ失敗", description: String(e), variant: "destructive" });
    },
  });

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(isoDate: string): string {
    const d = new Date(isoDate);
    return d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold" data-testid="page-title">設定</h1>

      {/* ── バックアップセクション ── */}
      <Card className="border" data-testid="section-backup">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Database className="h-4 w-4 text-emerald-500" />
            データベースバックアップ
          </CardTitle>
          <CardDescription className="text-xs">
            SQLiteデータベースのバックアップを手動で作成できます。最新30件を保持します。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {backupLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : backupInfo ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">データベースパス</p>
                  <p className="font-mono text-xs break-all mt-0.5">{backupInfo.dbPath}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">サイズ / 最終更新</p>
                  <p className="text-xs mt-0.5">
                    {formatBytes(backupInfo.dbSize)} / {formatDate(backupInfo.lastModified)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => backupMutation.mutate()}
                  disabled={backupMutation.isPending}
                  data-testid="button-create-backup"
                >
                  {backupMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <HardDrive className="h-4 w-4" />
                  )}
                  今すぐバックアップ
                </Button>
                <span className="text-xs text-muted-foreground">
                  保存先: {backupInfo.backupDir}
                </span>
              </div>

              {backupInfo.backups.length > 0 && (
                <div className="rounded-md border">
                  <table className="w-full text-sm" data-testid="backup-table">
                    <thead>
                      <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium text-xs">ファイル名</th>
                        <th className="px-3 py-2 font-medium text-xs">作成日時</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">サイズ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupInfo.backups.map((b) => (
                        <tr key={b.filename} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-3 py-1.5 font-mono text-xs">{b.filename}</td>
                          <td className="px-3 py-1.5 text-xs">{formatDate(b.date)}</td>
                          <td className="px-3 py-1.5 text-xs text-right tabular-nums">{formatBytes(b.size)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>

      <FooterAttribution />
    </div>
  );
}
