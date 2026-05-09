## 概要

PR-4: 補正値運用UI拡充。担当者が実際に補正値運用を行える状態に到達させます。デザイン方針（v24 確定、ニュー・スイス系）に沿って、補正値の入力・解除・表示UI、ダッシュボードと個人詳細画面の2窓表示、過去サイクルの認識担保UI、中長期過去データ整備の支援機能を実装します。

PR-1〜PR-3 を基盤として、PR-4 完了で業務完成度の到達点となります。

## 主な変更

### デザイン基盤（19ファイル、+2,241行 / -475行）
- CSS変数（`--ink`, `--surface`, `--pr4-border`, `--pr4-accent`, `--accent-soft` 等のカラーパレット）
- フォント読み込み（Inter / Noto Sans JP / JetBrains Mono）
- バッジバリアント（`neut` / `success` / `danger` / `warn` / `voided`）

### 補正値の入力・解除
- **補正値追加モーダル** (`AddAdjustmentDialog`): 種別選択（残を増やす/減らす）RadioGroupカード型 + 日数入力（0.125刻み）+ 理由入力（200文字制限）
- **解除モーダル** (`VoidLeaveUsageDialog`): 解除対象プレビュー、解除理由必須入力、解除後残日数の事前明示、警告ボックス
- `POST /api/leave-adjustments` / `PATCH /api/leave-usages/[id]/void` の2 APIルート
- フロントバリデーション統合（`lib/validations/leave-usage.ts` のZodスキーマをフロント・バック共通使用）

### 個人詳細画面
- **2窓表示の本格実装**: Primary（補正計算/実残日数、56px主数値、`--ink`枠、shadow-md）/ Secondary（自動計算/補正値なし、42px、dashed枠）
- **補正履歴一覧**: テーブル形式6列（日付/種別/日数/理由/状態/アクション）、解除済レコードの取り消し線・`--ink-35`視覚表現
- **繰越日数の内訳Popover**: `i`ボタンクリックで黒背景ポップオーバー（自動計算分 + 補正値由来分 `#5eead4`）
- **過去サイクルAccordion**: `getAllCycles()`で全過去サイクルをCollapsible表示、前サイクルはデフォルト展開
- **サイクル全体サマリ**: 6セルグリッド（付与/繰越/合計/使用/補正値合計/次サイクル繰越）、補正値合計と次サイクル繰越に`--accent-soft`ハイライト

### ダッシュボード
- **KPI 4列構成**: 在籍社員 / 5日義務未達 / 複合リスク / アクティブ補正値（>10件で amber アラート）
- **全社合計の2窓表示**: Primary（補正計算）/ Secondary（自動計算）
- **EmployeeCard**: 2窓表示をv24スタイルに更新
- `EmployeeSummary` 型に `activeAdjustmentCount` を追加

### 中長期過去データ整備の支援（v7 論点B 段階2）
- **分割機能** (`SplitAdjustmentDialog`): 1件の補正値を複数に分割。元レコードを解除済みにし、分割先を新規作成。合計一致バリデーション付き。
- **日付確定機能** (`ConfirmDateDialog`): 日付不明の補正値に具体的な`recordDate`を設定。
- 両操作を `leave_usage_history` に記録（action: `split` / `date_confirmed`）
- `POST /api/leave-adjustments/split` / `/confirm-date` の2 APIルート
- `storage.splitLeaveAdjustment()` / `confirmLeaveAdjustmentDate()` の2メソッド追加

### テスト
- 既存69テスト全パス
- 新規3テスト追加（分割・日付確定・合計不一致バリデーション）
- 合計72テスト全パス

## 含まないもの（明示的な除外）

- `paid_leaves.consumed_days` / `manual_baseline_*` カラムの物理削除 → PR-5
- 担当者ヒアリング（システム完成後・観察期間以降）
- 有給履歴照会画面 → PR-6
- 残業側の改修（変更なし、完全保持）

## リスク

🟢 低〜中リスク: UI拡充が中心でDBスキーマ変更なし。マイグレーション不要。

### 軽減策

- DBスキーマ変更なし — `leave_usages` / `leave_usage_history` テーブルへのINSERT/UPDATEのみ
- 分割機能は元レコードを解除済みにする設計のため、データ整合性を保持
- 全操作が `leave_usage_history` に記録されるため、監査追跡が可能
- ローカル検証DBで補正値追加→解除→分割→日付確定の全フローを検証済み

## 完了判定基準（実装計画書 第2版 6-6 の8項目）

- [x] 補正値入力UI（種別 + 日数 + 理由）が動作する
- [x] ダッシュボード2窓表示が本格実装されている
- [x] 補正履歴一覧が表示される
- [x] 解除UI（voided_reason 必須入力）が動作する
- [x] 新サイクル画面で繰越日数の内訳がホバークリックで表示される
- [x] 過去サイクル画面で補正値合計と次サイクル繰越への反映が表示される
- [x] 中長期過去データ整備の支援機能（分割・日付確定）が動作する
- [x] バリデーション（v16確定）がフロント・バック両方で適用される

## ロールバック手順

1. `git revert` でコード変更を巻き戻し
2. DBスキーマ変更なしのため、DB側の対応は不要
3. テスト用に追加したレコードは解除（void）済みのため、データ影響なし

## 本番反映フロー

1. PR をマージ
2. Vercel が自動デプロイ（DBスキーマ変更なし、マイグレーション不要）
3. 本番で補正値追加・解除・分割・日付確定の動作確認

## ローカル検証結果（Phase 6）

| 検証項目 | 結果 | 備考 |
|---|---|---|
| TypeScript型チェック | PASS | `tsc --noEmit` エラーなし |
| Production Build | PASS | |
| 補正値追加 → 残日数即時反映 | PASS | -1.5日追加 → adjustedRemainingDays 正常更新 |
| 補正値解除 → 残日数戻り | PASS | 解除後 adjustedRemainingDays 正常復帰 |
| バリデーション | PASS | 0.125刻み・0拒否・空理由拒否すべて正常 |
| 分割機能 | PASS | #128→#129+#130、合計一致、元レコード解除済み |
| 日付確定機能 | PASS | recordDate更新、履歴記録確認 |
| 既存機能 | PASS | 76名表示、98アラート、135残業レコード正常 |
| 全ページ HTTP 200 | PASS | /, /employees, /employees/1, /leave, /overtime, /settings |
| テスト 72/72 | PASS | |

## コミット構成（8件）

```
b17ccb1 style: CSS変数・フォント・バッジバリアントを追加
f6187ed feat: バリデーション統合（adjustmentDaysSchema・voidLeaveUsageSchema）
328dcb3 feat: 補正値追加モーダルとAPIを実装
3e4313b feat: 解除モーダルとAPIを実装
9b8787a feat: 個人詳細画面の2窓表示・補正履歴・過去サイクル・繰越ホバーを実装
5ee4e7c feat: ダッシュボードの2窓表示・KPI4列・EmployeeCard更新を実装
72d9651 feat: 補正値の分割・日付確定機能を実装
d85fcbc test: 分割・日付確定・バリデーションのテスト追加（72件全通過）
```
