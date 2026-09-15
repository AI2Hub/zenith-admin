-- pg_stat_statements 需要 shared_preload_libraries 配合；不可用时让迁移继续，SQL 监控页会显示降级原因。
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_stat_statements') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_stat_statements extension unavailable: %', SQLERRM;
    END;
  END IF;
END $$;