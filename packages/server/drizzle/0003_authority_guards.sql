-- Permission code stores and role publications participate in the same invalidation bus.
CREATE TRIGGER identity_access_grant_items_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "identity_access_grant_items"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('grant_id');--> statement-breakpoint
CREATE TRIGGER identity_user_permissions_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "identity_user_permissions"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate('user_id');--> statement-breakpoint
CREATE TRIGGER roles_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "roles"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate();--> statement-breakpoint
CREATE TRIGGER user_group_roles_cache_invalidate
  AFTER INSERT OR UPDATE OR DELETE ON "user_group_roles"
  FOR EACH ROW EXECUTE FUNCTION notify_cache_invalidate();--> statement-breakpoint

CREATE FUNCTION protect_identity_role_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['created_by', 'updated_by']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['created_by', 'updated_by']) THEN
    RAISE EXCEPTION 'Published role content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER identity_role_versions_immutable BEFORE UPDATE ON identity_role_versions
  FOR EACH ROW EXECUTE FUNCTION protect_identity_role_version();
