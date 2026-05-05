## 概要

PR-1 で構築した補正値履歴方式の基盤の上に、既存の consumed_days 直接入力運用から leave_usages の履歴ベース運用に切替えます。同時に既存データを補正値レコードとして変換するマイグレーションを実行します。

## 主な変更

### マイグレーション

- `scripts/migrations/pr-2-consumed-to-leave-usages.ts` を新規作成（ドライラン・ロールバック対応）
- `pr2_migration_log` テーブルを新規作成（ロールバック用）
- 既存 `paid_leaves.consumed_days > 0` の31件を `leave_usages` の補正値レコード（`record_type='adjustment'`）に変換
- `manual_baseline_*` の1件（id=71）を差分計算 → diff=0のためスキップ、フィールドのみクリア

### コード変更

- `lib/schema.ts`: `insertPaidLeaveSchema` から `consumed_days`/`manual_baseline_*` を排除
- `lib/storage.ts`: `upsertPaidLeave` から `consumed_days`/`manual_baseline_*` を引数排除、`getPaidLeaveByEmployee` で `adjustedRemainingDays`/`autoRemainingDays` を算出
- `lib/recalc-consumed.ts`: 履歴ベース計算に置換、`consumed_days` を派生値として更新
- `app/api/paid-leaves/route.ts`: PUT から manual_baseline 検証/consumed_days 計算を削除
- `app/api/seed/route.ts`, `app/api/fiscal-year-transition/route.ts`: `consumed_days` 引数排除

### UI応急対応

- 残日数表示を `adjustedRemainingDays` 優先に変更
- 「残日数修正」ボタンを無効化（ツールチップで案内）
- 残日数修正ダイアログに PR-4 案内メッセージ表示

### スキーマ

- `paid_leaves.consumed_days` の書き込みを停止（カラムは残す、PR-5で物理削除）
- `paid_leaves.manual_baseline_*` の書き込みを停止（同上）
- `paid_leaves.fiscal_year` はカラム残置（PR-3で物理削除）

## 含まないもの（明示的な除外）

- `paid_leaves.fiscal_year` の物理削除 → PR-3
- 補正値入力UI、補正値専用UI → PR-4
- `paid_leaves.consumed_days` カラムの物理削除 → PR-5

## リスク

> :warning: 高リスク PR: 既存データの書き換えを伴う

### 軽減策

- マイグレーションスクリプトに `--dry-run` / `--rollback` オプション
- `pr2_migration_log` テーブルで変更前の値を完全保存
- 本番DB接続の自動検出・中断機構
- 二重実行防止（既存ログがある場合はエラー）
- 移行後の整合性検証（consumed_days 派生値の一致確認）

## 完了判定基準（実装計画書 第2版 4-6節）

- [x] 32件の移行対象が全て処理されている（31件変換 + 1件diff=0スキップ）
- [x] 移行前後で各社員の残日数が一致する（diff確認済み: id=71のmanual_baseline_remainingクリアのみ）
- [x] `paid_leaves.consumed_days` への書き込みが停止している（派生値更新のみ）
- [x] `paid_leaves.manual_baseline_*` への書き込みが停止している
- [x] `upsertPaidLeave` の引数から `consumed_days`/`manual_baseline_*` が排除されている
- [x] 既存UI（残日数表示等）が従来通りの値で表示される
- [ ] 単体テストが全件通過

## ロールバック手順

1. `git revert` でコード変更を巻き戻し
2. `npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts --rollback` でDBを復元
3. または本番DBバックアップから完全復元

## 本番反映手順（別セッション）

1. マージ
2. 本番DBバックアップ取得
3. `npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts --dry-run` で本番確認
4. `npx tsx scripts/migrations/pr-2-consumed-to-leave-usages.ts` で本番マイグレーション実行
5. 動作確認
