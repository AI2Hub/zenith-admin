-- Custom SQL migration file, put your code below! --
CREATE TRIGGER menus_permission_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "menus"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate();--> statement-breakpoint
CREATE TRIGGER role_menus_permission_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "role_menus"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate();--> statement-breakpoint
CREATE TRIGGER user_groups_permission_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "user_groups"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate();
