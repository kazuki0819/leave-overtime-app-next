-- PR-5: paid_leaves から派生値・旧方式カラムを物理削除
-- 削除対象: consumed_days, remaining_days, usage_rate,
--          manual_baseline_date, manual_baseline_remaining, manual_baseline_note,
--          adjustment_days, adjustment_note

BEGIN;

-- マイグレーションログテーブルの作成(存在しなければ)
CREATE TABLE IF NOT EXISTS pr5_migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  executed_at TEXT NOT NULL,
  before_data_json TEXT NOT NULL,
  dropped_columns TEXT NOT NULL,
  remaining_columns_after TEXT NOT NULL
);

-- 実行前の paid_leaves の状態を JSON で記録
INSERT INTO pr5_migration_log (executed_at, before_data_json, dropped_columns, remaining_columns_after)
SELECT
  datetime('now') || 'Z',
  '[' || GROUP_CONCAT(
    json_object(
      'id', id,
      'employee_id', employee_id,
      'granted_days', granted_days,
      'carried_over_days', carried_over_days,
      'consumed_days', consumed_days,
      'remaining_days', remaining_days,
      'expired_days', expired_days,
      'usage_rate', usage_rate,
      'adjustment_days', adjustment_days,
      'adjustment_note', adjustment_note,
      'manual_baseline_date', manual_baseline_date,
      'manual_baseline_remaining', manual_baseline_remaining,
      'manual_baseline_note', manual_baseline_note
    )
  ) || ']',
  'consumed_days,remaining_days,usage_rate,manual_baseline_date,manual_baseline_remaining,manual_baseline_note,adjustment_days,adjustment_note',
  'id,employee_id,granted_days,carried_over_days,expired_days'
FROM paid_leaves;

-- カラム物理削除(Turso/libSQL は ALTER TABLE DROP COLUMN をサポート)
ALTER TABLE paid_leaves DROP COLUMN consumed_days;
ALTER TABLE paid_leaves DROP COLUMN remaining_days;
ALTER TABLE paid_leaves DROP COLUMN usage_rate;
ALTER TABLE paid_leaves DROP COLUMN manual_baseline_date;
ALTER TABLE paid_leaves DROP COLUMN manual_baseline_remaining;
ALTER TABLE paid_leaves DROP COLUMN manual_baseline_note;
ALTER TABLE paid_leaves DROP COLUMN adjustment_days;
ALTER TABLE paid_leaves DROP COLUMN adjustment_note;

COMMIT;
