-- ============================================================
-- 有給サイクル集計機能(要望2)のテストデータ
-- 投入先: ローカル検証DB(leave-overtime-local)のみ
-- ⚠️ 本番DBには絶対に投入しないこと ⚠️
-- ============================================================
-- 目的:
-- - year=2024&month=4 検証用: T001, T002, T005, T006
-- - year=2024&month=10 検証用: T003, T004, T008
-- - 古い退職(両方で対象外): T007
-- ============================================================

-- ----------------------------------------------------------
-- 1. employees テーブル
-- ----------------------------------------------------------
INSERT INTO employees (id, name, assignment, join_date, retired_date, status, tenure_months) VALUES
  ('T001', 'テスト太郎', 'A社', '2019-10-01', '', 'active', 0),
  ('T002', 'テスト花子', 'B社', '2020-10-01', '', 'active', 0),
  ('T003', 'テスト次郎', 'A社', '2019-04-01', '', 'active', 0),
  ('T004', 'テスト三郎', 'C社', '2022-04-01', '', 'active', 0),
  ('T005', '退職一郎', '-', '2017-10-01', '2024-09-30', 'retired', 0),
  ('T006', '退職花江', '-', '2016-10-01', '2025-04-15', 'retired', 0),
  ('T007', '退職古郎', '-', '2015-04-01', '2020-12-31', 'retired', 0),
  ('T008', 'テスト夏子', 'B社', '2023-04-01', '', 'active', 0);

-- ----------------------------------------------------------
-- 2. paid_leaves テーブル
-- 残日数 = 付与 + 繰越 - 消化 - 時効 を満たすよう設計
-- T007 はデータなし(古い退職、2024年付与なし)
-- ----------------------------------------------------------

-- T001: 標準・5日達成・取得率高(2024-04付与)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T001', 2024, 14, 2, 12, 4, 0, 86, NULL, NULL, NULL);

-- T002: 5日未達・取得率低(2024-04付与)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T002', 2024, 12, 0, 3, 9, 0, 25, NULL, NULL, NULL);

-- T003: 時効発生(2024-10付与)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T003', 2024, 16, 5, 10, 8, 3, 63, NULL, NULL, NULL);

-- T004: 残日数多い(2024-10付与)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T004', 2024, 12, 0, 2, 10, 0, 17, NULL, NULL, NULL);

-- T005: サイクル途中退職(2024-04付与、9月退職)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T005', 2024, 18, 2, 5, 15, 0, 28, NULL, NULL, NULL);

-- T006: サイクル後退職(2024-04付与、翌4月退職)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T006', 2024, 20, 0, 15, 5, 0, 75, NULL, NULL, NULL);

-- T008: 取得率中位(2024-10付与)
INSERT INTO paid_leaves (employee_id, fiscal_year, granted_days, carried_over_days, consumed_days, remaining_days, expired_days, usage_rate, manual_baseline_date, manual_baseline_remaining, manual_baseline_note)
VALUES ('T008', 2024, 10, 0, 6, 4, 0, 60, NULL, NULL, NULL);

-- ----------------------------------------------------------
-- 3. assignment_histories テーブル
-- 各社員に1件、付与日時点で有効な配属履歴
-- ----------------------------------------------------------
INSERT INTO assignment_histories (employee_id, assignment, start_date, end_date, note) VALUES
  ('T001', 'A社', '2019-10-01', '', ''),
  ('T002', 'B社', '2020-10-01', '', ''),
  ('T003', 'A社', '2019-04-01', '', ''),
  ('T004', 'C社', '2022-04-01', '', ''),
  ('T005', 'B社', '2017-10-01', '2024-09-30', ''),
  ('T006', 'A社', '2016-10-01', '2025-04-15', ''),
  ('T007', 'C社', '2015-04-01', '2020-12-31', ''),
  ('T008', 'B社', '2023-04-01', '', '');

-- ============================================================
-- テストデータ削除用 SQL(必要時に手動実行)
-- ============================================================
-- DELETE FROM assignment_histories WHERE employee_id IN ('T001','T002','T003','T004','T005','T006','T007','T008');
-- DELETE FROM paid_leaves WHERE employee_id IN ('T001','T002','T003','T004','T005','T006','T007','T008');
-- DELETE FROM employees WHERE id IN ('T001','T002','T003','T004','T005','T006','T007','T008');
