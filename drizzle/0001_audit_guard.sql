-- 操作ログとポイント台帳は追記のみ（更新・削除を禁止）
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% は追記のみのテーブルです（更新・削除はできません）', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER point_entries_append_only BEFORE UPDATE OR DELETE ON point_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
