## 概要

有給管理から「年度」概念を完全削除し、個人サイクルベースに統一します。`paid_leaves.fiscal_year` カラムを物理削除し、有給側の `useFiscalYear` 利用箇所を修正します。残業管理側の年度概念は完全保持します。

## 主な変更

### マイグレーション
- `scripts/migrations/pr-3-fiscal-year-removal.ts` 新規作成（ドライラン・ロールバック対応）
- `pr3_migration_log` テーブル新規作成（ロールバック用、`paid_leaves` 全データを JSON で保存）
- `paid_leaves.fiscal_year` カラムを物理削除

### コード変更（24ファイル、+183行 / -610行、純削減427行）
- `lib/schema.ts`: `paid_leaves.fiscal_year` を削除
- `lib/leave-calc.ts`: サイクルベース計算用ヘルパー関数5本を追加（`getCurrentCycleStart`, `getCurrentCycleRange`, `getAllCycles`, `getCycleByIndex`, `getCycleIndexForGrantDate`）
- `lib/storage.ts`: `getPaidLeaves()`, `getPaidLeaveByEmployee()`, `upsertPaidLeave()`, `getPaidLeaveAlerts()` から `fiscalYear` 引数を除去。`getEmployeeSummaries` に `adjustedRemainingDays`/`autoRemainingDays` を追加
- API層 7ファイルから `fiscalYear` フィルタを除去
- `app/api/fiscal-year-transition/` ディレクトリを削除（有給専用APIで残業側依存なし）
- ダッシュボード: 年度ドロップダウン削除、サイクルベース表示に変更
- 個人詳細画面: サイクル切替UI導入、`useFiscalYear` 全箇所修正
- 有給管理画面: `useFiscalYear`/`FiscalYearSelector` 除去
- 社員一覧: `useFiscalYear` 除去
- 設定画面: 年度切替セクション撤去（バックアップのみ残留、-352行）

### ダッシュボード2窓表示（最小実装）
- 各社員カードに `adjustedRemainingDays`（補正値あり）と `autoRemainingDays`（補正値なし）を表示する構造を導入
- 本格的な並列表示・装飾は PR-4 で実施

### 残業側
- `fiscal_year` 完全保持（変更なし）
- `components/pages/overtime-management.tsx` も変更なし
- `components/fiscal-year-selector.tsx` / `hooks/use-fiscal-year.tsx` は残業側専用として残留（コメント追記）

### テスト
- 既存40テスト全パス
- 新規15テスト追加（サイクルベース計算関数のユニットテスト）
- 合計55テスト全パス

## 含まないもの（明示的な除外）

- 補正値入力UI、補正値専用UI → PR-4
- 解除UI、補正履歴一覧 → PR-4
- ダッシュボード2窓表示の本格実装 → PR-4
- `paid_leaves.consumed_days` の物理削除 → PR-5
- `paid_leaves.manual_baseline_*` の物理削除 → PR-5

## リスク

⚠️ 高リスク PR: UI大改修。24ファイル変更、純削減427行。

### 軽減策

- マイグレーションスクリプトに `--dry-run` / `--rollback` オプション
- `pr3_migration_log` テーブルで実行前データを完全保存（JSON）
- 本番DB接続の自動検出・中断機構
- 残業側との分離を厳格に管理（修正対象/不要ファイルを明示）
- ローカル検証DBでマイグレーション→ロールバック→再マイグレーションの3サイクル検証済み

## 完了判定基準（実装計画書 第2版 5-5節）

- [ ] `paid_leaves.fiscal_year` カラムが本番DBから削除されている
- [x] ダッシュボードがサイクルベースで表示される
- [x] 個人詳細画面がサイクルベースで表示される
- [x] 有給管理・社員一覧・設定画面の `useFiscalYear` 利用箇所が修正されている
- [x] ダッシュボード2窓表示の基盤UIが動作する
- [x] 残業側が従来通り動作する（`fiscal_year` 完全保持）
- [x] 単体テスト全件通過（55件）

## ロールバック手順

1. `git revert` でコード変更を巻き戻し
2. `npx tsx scripts/migrations/pr-3-fiscal-year-removal.ts --rollback` でDBを復元
3. または本番DBバックアップから完全復元

## ローカル検証結果

| 画面 | 状態 | 備考 |
|------|------|------|
| ダッシュボード | OK | 76名表示、2窓データ返却、FiscalYearSelector除去 |
| 有給管理 | OK | fiscalYear参照なし |
| 付与サイクルレビュー | OK | employeeId + isGrantedInMonth ベース |
| 社員一覧 | OK | fiscalYear参照なし |
| 社員詳細(id=71) | OK | サイクルベース表示、adjusted=10/auto=10 |
| 設定 | OK | バックアップのみ、年度切替撤去 |
| 残業管理 | OK | useFiscalYear/FiscalYearSelector健在、135レコード正常 |
