# PR-5 本番反映チェックリスト

## 前提条件
- [ ] PR-5 ブランチ feature/pr-5-derive-values がレビュー可能な状態
- [ ] 全 Phase の完了報告が引き継ぎ資料に記載されている
- [ ] 担当者にシステム利用停止を依頼済み(復旧見込み時刻も伝達)

## 本番反映の前(必須)
- [ ] 本番DBのフルバックアップ取得
```
turso db shell leave-overtime-prod ".dump" > ~/Documents/backup/pre-pr5-prod-$(date +%Y%m%d-%H%M%S).sql
```
- [ ] バックアップサイズが 120KB 以上あることを確認(空ダンプではないこと)
- [ ] ローカル検証DB での動作確認結果に問題がない

## 本番反映の手順
1. [ ] feature/pr-5-derive-values ブランチを push
2. [ ] GitHub で PR を作成
3. [ ] Vercel Preview のビルド成功を確認
4. [ ] Preview 環境で簡易動作確認(ダッシュボードと個人詳細)
5. [ ] **本番DBにマイグレーション SQL を実行**
```
turso db shell leave-overtime-prod < migrations/pr5_drop_paid_leaves_columns.sql
```
6. [ ] マイグレーション実行結果を確認
```
turso db shell leave-overtime-prod "PRAGMA table_info(paid_leaves);"
turso db shell leave-overtime-prod "SELECT executed_at FROM pr5_migration_log;"
```
7. [ ] PR をマージ
8. [ ] Vercel 自動デプロイの完了を確認
9. [ ] 本番URL でスーパーリロード(Cmd+Shift+R)して動作確認

## 本番反映後の検証
- [ ] ダッシュボードで「補正込」と「自動計算」が異なる値になっているか
- [ ] 有給取得率が 0.00% ではないか
- [ ] 個人詳細画面の 2 窓表示が機能しているか
- [ ] 任意の社員で有給取得を 1 件入力し、画面に即時反映されるか
- [ ] 担当者へ業務再開可能の連絡

## ロールバック手順(万一のとき)
1. Vercel で PR-5 マージ前のデプロイにロールバック
2. 本番DBバックアップから復元
```
turso db shell leave-overtime-prod < ~/Documents/backup/pre-pr5-prod-YYYYMMDD-HHMMSS.sql
```
3. ロールバック後の動作確認
