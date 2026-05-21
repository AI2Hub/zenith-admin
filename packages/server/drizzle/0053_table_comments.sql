-- 为所有业务表与字段添加中文注释（PostgreSQL COMMENT）
-- 可通过 psql \d+ <table> 或 SELECT obj_description('schema.table'::regclass) 查看
--> statement-breakpoint

-- ─── tenants 租户 ───────────────────────────────────────────────────────────
COMMENT ON TABLE "tenants" IS '租户表';
COMMENT ON COLUMN "tenants"."id" IS '主键 ID';
COMMENT ON COLUMN "tenants"."name" IS '租户名称';
COMMENT ON COLUMN "tenants"."code" IS '租户编码（全局唯一）';
COMMENT ON COLUMN "tenants"."logo" IS '租户 Logo URL';
COMMENT ON COLUMN "tenants"."contact_name" IS '联系人姓名';
COMMENT ON COLUMN "tenants"."contact_phone" IS '联系人电话';
COMMENT ON COLUMN "tenants"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "tenants"."expire_at" IS '到期时间';
COMMENT ON COLUMN "tenants"."max_users" IS '最大用户数限制';
COMMENT ON COLUMN "tenants"."remark" IS '备注';
COMMENT ON COLUMN "tenants"."created_by" IS '创建人（users.id）';
COMMENT ON COLUMN "tenants"."updated_by" IS '最后更新人（users.id）';
COMMENT ON COLUMN "tenants"."created_at" IS '创建时间';
COMMENT ON COLUMN "tenants"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── departments 部门 ───────────────────────────────────────────────────────
COMMENT ON TABLE "departments" IS '部门表';
COMMENT ON COLUMN "departments"."id" IS '主键 ID';
COMMENT ON COLUMN "departments"."parent_id" IS '上级部门 ID（0 表示根节点）';
COMMENT ON COLUMN "departments"."name" IS '部门名称';
COMMENT ON COLUMN "departments"."code" IS '部门编码（租户内唯一）';
COMMENT ON COLUMN "departments"."leader_id" IS '负责人用户 ID';
COMMENT ON COLUMN "departments"."phone" IS '部门联系电话';
COMMENT ON COLUMN "departments"."email" IS '部门邮箱';
COMMENT ON COLUMN "departments"."sort" IS '排序值（升序）';
COMMENT ON COLUMN "departments"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "departments"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "departments"."created_by" IS '创建人';
COMMENT ON COLUMN "departments"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "departments"."created_at" IS '创建时间';
COMMENT ON COLUMN "departments"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── positions 岗位 ─────────────────────────────────────────────────────────
COMMENT ON TABLE "positions" IS '岗位表';
COMMENT ON COLUMN "positions"."id" IS '主键 ID';
COMMENT ON COLUMN "positions"."name" IS '岗位名称';
COMMENT ON COLUMN "positions"."code" IS '岗位编码（租户内唯一）';
COMMENT ON COLUMN "positions"."sort" IS '排序值';
COMMENT ON COLUMN "positions"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "positions"."remark" IS '备注';
COMMENT ON COLUMN "positions"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "positions"."created_by" IS '创建人';
COMMENT ON COLUMN "positions"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "positions"."created_at" IS '创建时间';
COMMENT ON COLUMN "positions"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── users 用户 ─────────────────────────────────────────────────────────────
COMMENT ON TABLE "users" IS '用户表';
COMMENT ON COLUMN "users"."id" IS '主键 ID';
COMMENT ON COLUMN "users"."username" IS '登录用户名（租户内唯一）';
COMMENT ON COLUMN "users"."nickname" IS '昵称/显示名';
COMMENT ON COLUMN "users"."email" IS '邮箱（租户内唯一）';
COMMENT ON COLUMN "users"."password" IS '密码哈希值（bcrypt）';
COMMENT ON COLUMN "users"."avatar" IS '头像 URL';
COMMENT ON COLUMN "users"."phone" IS '手机号';
COMMENT ON COLUMN "users"."department_id" IS '所属部门 ID';
COMMENT ON COLUMN "users"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "users"."status" IS '账号状态：enabled/disabled';
COMMENT ON COLUMN "users"."preferences" IS '个人偏好设置（JSON）';
COMMENT ON COLUMN "users"."password_updated_at" IS '密码最近修改时间';
COMMENT ON COLUMN "users"."created_by" IS '创建人';
COMMENT ON COLUMN "users"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "users"."created_at" IS '创建时间';
COMMENT ON COLUMN "users"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── menus 菜单 ─────────────────────────────────────────────────────────────
COMMENT ON TABLE "menus" IS '菜单/权限点表';
COMMENT ON COLUMN "menus"."id" IS '主键 ID';
COMMENT ON COLUMN "menus"."parent_id" IS '上级菜单 ID（0 表示根节点）';
COMMENT ON COLUMN "menus"."title" IS '菜单显示标题';
COMMENT ON COLUMN "menus"."name" IS '路由 name（前端 Vue/React Router 命名路由）';
COMMENT ON COLUMN "menus"."path" IS '路由路径';
COMMENT ON COLUMN "menus"."component" IS '前端组件路径';
COMMENT ON COLUMN "menus"."icon" IS '图标名称（lucide-react）';
COMMENT ON COLUMN "menus"."type" IS '类型：directory 目录 / menu 菜单 / button 按钮（权限点）';
COMMENT ON COLUMN "menus"."permission" IS '权限标识（如 user:create）';
COMMENT ON COLUMN "menus"."sort" IS '排序值';
COMMENT ON COLUMN "menus"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "menus"."visible" IS '是否在侧边栏可见';
COMMENT ON COLUMN "menus"."created_by" IS '创建人';
COMMENT ON COLUMN "menus"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "menus"."created_at" IS '创建时间';
COMMENT ON COLUMN "menus"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── roles 角色 ─────────────────────────────────────────────────────────────
COMMENT ON TABLE "roles" IS '角色表';
COMMENT ON COLUMN "roles"."id" IS '主键 ID';
COMMENT ON COLUMN "roles"."name" IS '角色名称';
COMMENT ON COLUMN "roles"."code" IS '角色编码（租户内唯一）';
COMMENT ON COLUMN "roles"."description" IS '角色描述';
COMMENT ON COLUMN "roles"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "roles"."data_scope" IS '数据权限范围：all 全部 / dept 本部门 / self 本人';
COMMENT ON COLUMN "roles"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "roles"."created_by" IS '创建人';
COMMENT ON COLUMN "roles"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "roles"."created_at" IS '创建时间';
COMMENT ON COLUMN "roles"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── user_roles 用户-角色关联 ───────────────────────────────────────────────
COMMENT ON TABLE "user_roles" IS '用户-角色关联表';
COMMENT ON COLUMN "user_roles"."user_id" IS '用户 ID';
COMMENT ON COLUMN "user_roles"."role_id" IS '角色 ID';
--> statement-breakpoint

-- ─── user_positions 用户-岗位关联 ───────────────────────────────────────────
COMMENT ON TABLE "user_positions" IS '用户-岗位关联表';
COMMENT ON COLUMN "user_positions"."user_id" IS '用户 ID';
COMMENT ON COLUMN "user_positions"."position_id" IS '岗位 ID';
--> statement-breakpoint

-- ─── role_menus 角色-菜单关联 ───────────────────────────────────────────────
COMMENT ON TABLE "role_menus" IS '角色-菜单（权限）关联表';
COMMENT ON COLUMN "role_menus"."role_id" IS '角色 ID';
COMMENT ON COLUMN "role_menus"."menu_id" IS '菜单 ID';
--> statement-breakpoint

-- ─── dicts 字典 ─────────────────────────────────────────────────────────────
COMMENT ON TABLE "dicts" IS '数据字典表';
COMMENT ON COLUMN "dicts"."id" IS '主键 ID';
COMMENT ON COLUMN "dicts"."name" IS '字典名称';
COMMENT ON COLUMN "dicts"."code" IS '字典编码（租户内唯一）';
COMMENT ON COLUMN "dicts"."description" IS '描述';
COMMENT ON COLUMN "dicts"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "dicts"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "dicts"."created_by" IS '创建人';
COMMENT ON COLUMN "dicts"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "dicts"."created_at" IS '创建时间';
COMMENT ON COLUMN "dicts"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── dict_items 字典项 ──────────────────────────────────────────────────────
COMMENT ON TABLE "dict_items" IS '字典项表';
COMMENT ON COLUMN "dict_items"."id" IS '主键 ID';
COMMENT ON COLUMN "dict_items"."dict_id" IS '所属字典 ID';
COMMENT ON COLUMN "dict_items"."label" IS '显示标签';
COMMENT ON COLUMN "dict_items"."value" IS '取值（字典内唯一）';
COMMENT ON COLUMN "dict_items"."color" IS '前端展示颜色（可选）';
COMMENT ON COLUMN "dict_items"."sort" IS '排序值';
COMMENT ON COLUMN "dict_items"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "dict_items"."remark" IS '备注';
COMMENT ON COLUMN "dict_items"."created_by" IS '创建人';
COMMENT ON COLUMN "dict_items"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "dict_items"."created_at" IS '创建时间';
COMMENT ON COLUMN "dict_items"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── file_storage_configs 文件存储配置 ──────────────────────────────────────
COMMENT ON TABLE "file_storage_configs" IS '文件存储配置表（本地/OSS/S3/COS）';
COMMENT ON COLUMN "file_storage_configs"."id" IS '主键 ID';
COMMENT ON COLUMN "file_storage_configs"."name" IS '配置名称';
COMMENT ON COLUMN "file_storage_configs"."provider" IS '存储类型：local/oss/s3/cos';
COMMENT ON COLUMN "file_storage_configs"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "file_storage_configs"."is_default" IS '是否默认存储（全局仅一个）';
COMMENT ON COLUMN "file_storage_configs"."base_path" IS '基础路径（对象 key 前缀）';
COMMENT ON COLUMN "file_storage_configs"."local_root_path" IS '本地存储根目录（local 模式）';
COMMENT ON COLUMN "file_storage_configs"."oss_region" IS '阿里云 OSS Region';
COMMENT ON COLUMN "file_storage_configs"."oss_endpoint" IS '阿里云 OSS Endpoint';
COMMENT ON COLUMN "file_storage_configs"."oss_bucket" IS '阿里云 OSS Bucket';
COMMENT ON COLUMN "file_storage_configs"."oss_access_key_id" IS '阿里云 AccessKeyId';
COMMENT ON COLUMN "file_storage_configs"."oss_access_key_secret" IS '阿里云 AccessKeySecret';
COMMENT ON COLUMN "file_storage_configs"."s3_region" IS 'S3 Region';
COMMENT ON COLUMN "file_storage_configs"."s3_endpoint" IS 'S3 Endpoint（MinIO/R2 使用）';
COMMENT ON COLUMN "file_storage_configs"."s3_bucket" IS 'S3 Bucket';
COMMENT ON COLUMN "file_storage_configs"."s3_access_key_id" IS 'S3 AccessKeyId';
COMMENT ON COLUMN "file_storage_configs"."s3_secret_access_key" IS 'S3 SecretAccessKey';
COMMENT ON COLUMN "file_storage_configs"."s3_force_path_style" IS '是否强制使用 path-style 寻址';
COMMENT ON COLUMN "file_storage_configs"."cos_region" IS '腾讯云 COS Region';
COMMENT ON COLUMN "file_storage_configs"."cos_bucket" IS '腾讯云 COS Bucket';
COMMENT ON COLUMN "file_storage_configs"."cos_secret_id" IS '腾讯云 SecretId';
COMMENT ON COLUMN "file_storage_configs"."cos_secret_key" IS '腾讯云 SecretKey';
COMMENT ON COLUMN "file_storage_configs"."remark" IS '备注';
COMMENT ON COLUMN "file_storage_configs"."created_by" IS '创建人';
COMMENT ON COLUMN "file_storage_configs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "file_storage_configs"."created_at" IS '创建时间';
COMMENT ON COLUMN "file_storage_configs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── managed_files 文件记录 ─────────────────────────────────────────────────
COMMENT ON TABLE "managed_files" IS '文件元数据表';
COMMENT ON COLUMN "managed_files"."id" IS '主键 ID';
COMMENT ON COLUMN "managed_files"."storage_config_id" IS '所属存储配置 ID';
COMMENT ON COLUMN "managed_files"."storage_name" IS '存储配置名称快照';
COMMENT ON COLUMN "managed_files"."provider" IS '存储类型快照';
COMMENT ON COLUMN "managed_files"."original_name" IS '原始文件名';
COMMENT ON COLUMN "managed_files"."object_key" IS '存储对象 Key（相对路径）';
COMMENT ON COLUMN "managed_files"."size" IS '文件大小（字节）';
COMMENT ON COLUMN "managed_files"."mime_type" IS 'MIME 类型';
COMMENT ON COLUMN "managed_files"."extension" IS '扩展名（不含点）';
COMMENT ON COLUMN "managed_files"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "managed_files"."created_by" IS '上传人';
COMMENT ON COLUMN "managed_files"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "managed_files"."created_at" IS '上传时间';
COMMENT ON COLUMN "managed_files"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── login_logs 登录日志 ────────────────────────────────────────────────────
COMMENT ON TABLE "login_logs" IS '登录日志表';
COMMENT ON COLUMN "login_logs"."id" IS '主键 ID';
COMMENT ON COLUMN "login_logs"."user_id" IS '用户 ID（登录失败时可能为空）';
COMMENT ON COLUMN "login_logs"."username" IS '登录用户名';
COMMENT ON COLUMN "login_logs"."ip" IS '登录 IP';
COMMENT ON COLUMN "login_logs"."browser" IS '浏览器信息';
COMMENT ON COLUMN "login_logs"."os" IS '操作系统';
COMMENT ON COLUMN "login_logs"."status" IS '登录结果：success/fail';
COMMENT ON COLUMN "login_logs"."message" IS '失败原因或附加信息';
COMMENT ON COLUMN "login_logs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "login_logs"."created_at" IS '登录时间';
--> statement-breakpoint

-- ─── operation_logs 操作日志 ────────────────────────────────────────────────
COMMENT ON TABLE "operation_logs" IS '操作日志表';
COMMENT ON COLUMN "operation_logs"."id" IS '主键 ID';
COMMENT ON COLUMN "operation_logs"."user_id" IS '操作用户 ID';
COMMENT ON COLUMN "operation_logs"."username" IS '操作用户名';
COMMENT ON COLUMN "operation_logs"."module" IS '所属模块';
COMMENT ON COLUMN "operation_logs"."description" IS '操作描述';
COMMENT ON COLUMN "operation_logs"."method" IS 'HTTP 方法';
COMMENT ON COLUMN "operation_logs"."path" IS '请求路径';
COMMENT ON COLUMN "operation_logs"."request_id" IS '请求追踪 ID';
COMMENT ON COLUMN "operation_logs"."request_body" IS '请求体（脱敏后）';
COMMENT ON COLUMN "operation_logs"."before_data" IS '变更前数据快照（JSON）';
COMMENT ON COLUMN "operation_logs"."after_data" IS '变更后数据快照（JSON）';
COMMENT ON COLUMN "operation_logs"."response_code" IS '业务响应码（0 表示成功）';
COMMENT ON COLUMN "operation_logs"."duration_ms" IS '处理耗时（毫秒）';
COMMENT ON COLUMN "operation_logs"."ip" IS '客户端 IP';
COMMENT ON COLUMN "operation_logs"."user_agent" IS 'User-Agent';
COMMENT ON COLUMN "operation_logs"."os" IS '操作系统';
COMMENT ON COLUMN "operation_logs"."browser" IS '浏览器';
COMMENT ON COLUMN "operation_logs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "operation_logs"."created_at" IS '请求时间';
--> statement-breakpoint

-- ─── announcements 公告 ─────────────────────────────────────────────────────
COMMENT ON TABLE "announcements" IS '公告表';
COMMENT ON COLUMN "announcements"."id" IS '主键 ID';
COMMENT ON COLUMN "announcements"."title" IS '公告标题';
COMMENT ON COLUMN "announcements"."content" IS '公告内容（富文本/Markdown）';
COMMENT ON COLUMN "announcements"."type" IS '公告类型（notice/活动/系统等）';
COMMENT ON COLUMN "announcements"."publish_status" IS '发布状态：draft/published/...';
COMMENT ON COLUMN "announcements"."priority" IS '优先级：low/medium/high';
COMMENT ON COLUMN "announcements"."target_type" IS '目标范围：all/users/roles/depts';
COMMENT ON COLUMN "announcements"."publish_time" IS '发布时间';
COMMENT ON COLUMN "announcements"."create_by_id" IS '发布人 ID';
COMMENT ON COLUMN "announcements"."create_by_name" IS '发布人姓名';
COMMENT ON COLUMN "announcements"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "announcements"."created_by" IS '创建人';
COMMENT ON COLUMN "announcements"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "announcements"."created_at" IS '创建时间';
COMMENT ON COLUMN "announcements"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── announcement_reads 公告已读 ────────────────────────────────────────────
COMMENT ON TABLE "announcement_reads" IS '公告已读记录表';
COMMENT ON COLUMN "announcement_reads"."id" IS '主键 ID';
COMMENT ON COLUMN "announcement_reads"."announcement_id" IS '公告 ID';
COMMENT ON COLUMN "announcement_reads"."user_id" IS '阅读用户 ID';
COMMENT ON COLUMN "announcement_reads"."read_at" IS '阅读时间';
--> statement-breakpoint

-- ─── announcement_recipients 公告收件人 ─────────────────────────────────────
COMMENT ON TABLE "announcement_recipients" IS '公告收件人定向表';
COMMENT ON COLUMN "announcement_recipients"."id" IS '主键 ID';
COMMENT ON COLUMN "announcement_recipients"."announcement_id" IS '公告 ID';
COMMENT ON COLUMN "announcement_recipients"."recipient_type" IS '收件人类型：user/role/dept';
COMMENT ON COLUMN "announcement_recipients"."recipient_id" IS '收件人 ID（对应类型表的主键）';
--> statement-breakpoint

-- ─── system_configs 系统配置 ────────────────────────────────────────────────
COMMENT ON TABLE "system_configs" IS '系统参数配置表';
COMMENT ON COLUMN "system_configs"."id" IS '主键 ID';
COMMENT ON COLUMN "system_configs"."config_key" IS '配置键（租户内唯一）';
COMMENT ON COLUMN "system_configs"."config_value" IS '配置值';
COMMENT ON COLUMN "system_configs"."config_type" IS '值类型：string/number/boolean/json';
COMMENT ON COLUMN "system_configs"."description" IS '描述';
COMMENT ON COLUMN "system_configs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "system_configs"."created_by" IS '创建人';
COMMENT ON COLUMN "system_configs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "system_configs"."created_at" IS '创建时间';
COMMENT ON COLUMN "system_configs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── cron_jobs 定时任务 ─────────────────────────────────────────────────────
COMMENT ON TABLE "cron_jobs" IS '定时任务表';
COMMENT ON COLUMN "cron_jobs"."id" IS '主键 ID';
COMMENT ON COLUMN "cron_jobs"."name" IS '任务名称（全局唯一）';
COMMENT ON COLUMN "cron_jobs"."cron_expression" IS 'Cron 表达式';
COMMENT ON COLUMN "cron_jobs"."handler" IS '处理器键（代码注册的任务标识）';
COMMENT ON COLUMN "cron_jobs"."params" IS '处理器参数（JSON 字符串）';
COMMENT ON COLUMN "cron_jobs"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "cron_jobs"."description" IS '描述';
COMMENT ON COLUMN "cron_jobs"."retry_count" IS '失败重试次数';
COMMENT ON COLUMN "cron_jobs"."retry_interval" IS '重试间隔（秒）';
COMMENT ON COLUMN "cron_jobs"."monitor_timeout" IS '执行超时告警阈值（秒）';
COMMENT ON COLUMN "cron_jobs"."last_run_at" IS '最近一次执行开始时间';
COMMENT ON COLUMN "cron_jobs"."next_run_at" IS '下一次预计执行时间';
COMMENT ON COLUMN "cron_jobs"."last_run_status" IS '最近一次执行结果：success/fail/running';
COMMENT ON COLUMN "cron_jobs"."last_run_message" IS '最近一次执行附加信息';
COMMENT ON COLUMN "cron_jobs"."created_by" IS '创建人';
COMMENT ON COLUMN "cron_jobs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "cron_jobs"."created_at" IS '创建时间';
COMMENT ON COLUMN "cron_jobs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── cron_job_logs 定时任务日志 ─────────────────────────────────────────────
COMMENT ON TABLE "cron_job_logs" IS '定时任务执行日志表';
COMMENT ON COLUMN "cron_job_logs"."id" IS '主键 ID';
COMMENT ON COLUMN "cron_job_logs"."job_id" IS '关联任务 ID';
COMMENT ON COLUMN "cron_job_logs"."job_name" IS '任务名称快照';
COMMENT ON COLUMN "cron_job_logs"."execution_count" IS '本次第几次重试（从 1 起）';
COMMENT ON COLUMN "cron_job_logs"."started_at" IS '开始时间';
COMMENT ON COLUMN "cron_job_logs"."ended_at" IS '结束时间';
COMMENT ON COLUMN "cron_job_logs"."duration_ms" IS '耗时（毫秒）';
COMMENT ON COLUMN "cron_job_logs"."status" IS '状态：success/fail/running';
COMMENT ON COLUMN "cron_job_logs"."output" IS '执行输出/错误堆栈';
--> statement-breakpoint

-- ─── regions 行政区划 ──────────────────────────────────────────────────────
COMMENT ON TABLE "regions" IS '中国行政区划表';
COMMENT ON COLUMN "regions"."id" IS '主键 ID';
COMMENT ON COLUMN "regions"."code" IS '行政区划代码（全局唯一）';
COMMENT ON COLUMN "regions"."name" IS '区划名称';
COMMENT ON COLUMN "regions"."level" IS '层级：province/city/county';
COMMENT ON COLUMN "regions"."parent_code" IS '父级区划代码';
COMMENT ON COLUMN "regions"."sort" IS '排序值';
COMMENT ON COLUMN "regions"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "regions"."created_by" IS '创建人';
COMMENT ON COLUMN "regions"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "regions"."created_at" IS '创建时间';
COMMENT ON COLUMN "regions"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── email_configs 邮件 SMTP 配置 ───────────────────────────────────────────
COMMENT ON TABLE "email_configs" IS '邮件 SMTP 配置表（全局单例使用）';
COMMENT ON COLUMN "email_configs"."id" IS '主键 ID';
COMMENT ON COLUMN "email_configs"."smtp_host" IS 'SMTP 服务器地址';
COMMENT ON COLUMN "email_configs"."smtp_port" IS 'SMTP 端口（465/587/25）';
COMMENT ON COLUMN "email_configs"."smtp_user" IS 'SMTP 用户名';
COMMENT ON COLUMN "email_configs"."smtp_password" IS 'SMTP 密码（加密存储）';
COMMENT ON COLUMN "email_configs"."from_name" IS '发件人显示名';
COMMENT ON COLUMN "email_configs"."from_email" IS '发件人邮箱';
COMMENT ON COLUMN "email_configs"."encryption" IS '加密方式：none/ssl/tls';
COMMENT ON COLUMN "email_configs"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "email_configs"."created_by" IS '创建人';
COMMENT ON COLUMN "email_configs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "email_configs"."created_at" IS '创建时间';
COMMENT ON COLUMN "email_configs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── user_oauth_accounts 第三方账号绑定 ─────────────────────────────────────
COMMENT ON TABLE "user_oauth_accounts" IS 'OAuth 第三方账号绑定表';
COMMENT ON COLUMN "user_oauth_accounts"."id" IS '主键 ID';
COMMENT ON COLUMN "user_oauth_accounts"."user_id" IS '关联用户 ID';
COMMENT ON COLUMN "user_oauth_accounts"."provider" IS '第三方平台：github/dingtalk/wechat_work';
COMMENT ON COLUMN "user_oauth_accounts"."open_id" IS '平台用户 OpenID';
COMMENT ON COLUMN "user_oauth_accounts"."union_id" IS '平台 UnionID（如有）';
COMMENT ON COLUMN "user_oauth_accounts"."nickname" IS '第三方平台昵称';
COMMENT ON COLUMN "user_oauth_accounts"."avatar" IS '第三方平台头像';
COMMENT ON COLUMN "user_oauth_accounts"."access_token" IS 'AccessToken';
COMMENT ON COLUMN "user_oauth_accounts"."refresh_token" IS 'RefreshToken';
COMMENT ON COLUMN "user_oauth_accounts"."expires_at" IS 'Token 过期时间';
COMMENT ON COLUMN "user_oauth_accounts"."raw" IS '平台返回原始 JSON';
COMMENT ON COLUMN "user_oauth_accounts"."created_at" IS '绑定时间';
COMMENT ON COLUMN "user_oauth_accounts"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── oauth_configs OAuth 配置 ───────────────────────────────────────────────
COMMENT ON TABLE "oauth_configs" IS 'OAuth 第三方登录配置表';
COMMENT ON COLUMN "oauth_configs"."id" IS '主键 ID';
COMMENT ON COLUMN "oauth_configs"."provider" IS '平台：github/dingtalk/wechat_work（唯一）';
COMMENT ON COLUMN "oauth_configs"."client_id" IS 'Client ID / AppKey';
COMMENT ON COLUMN "oauth_configs"."client_secret" IS 'Client Secret / AppSecret';
COMMENT ON COLUMN "oauth_configs"."agent_id" IS '企业微信 AgentId';
COMMENT ON COLUMN "oauth_configs"."corp_id" IS '钉钉/企业微信 CorpId';
COMMENT ON COLUMN "oauth_configs"."enabled" IS '是否启用';
COMMENT ON COLUMN "oauth_configs"."created_by" IS '创建人';
COMMENT ON COLUMN "oauth_configs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "oauth_configs"."created_at" IS '创建时间';
COMMENT ON COLUMN "oauth_configs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── db_backups 数据库备份记录 ──────────────────────────────────────────────
COMMENT ON TABLE "db_backups" IS '数据库备份记录表';
COMMENT ON COLUMN "db_backups"."id" IS '主键 ID';
COMMENT ON COLUMN "db_backups"."name" IS '备份名称';
COMMENT ON COLUMN "db_backups"."type" IS '备份方式：pg_dump/drizzle_export';
COMMENT ON COLUMN "db_backups"."file_id" IS '关联文件 ID（managed_files.id）';
COMMENT ON COLUMN "db_backups"."file_size" IS '备份文件大小（字节）';
COMMENT ON COLUMN "db_backups"."status" IS '状态：pending/running/success/failed';
COMMENT ON COLUMN "db_backups"."tables" IS '备份涉及的表（逗号分隔，NULL 表示全库）';
COMMENT ON COLUMN "db_backups"."started_at" IS '开始时间';
COMMENT ON COLUMN "db_backups"."completed_at" IS '完成时间';
COMMENT ON COLUMN "db_backups"."duration_ms" IS '耗时（毫秒）';
COMMENT ON COLUMN "db_backups"."error_message" IS '错误信息';
COMMENT ON COLUMN "db_backups"."created_by" IS '操作人';
COMMENT ON COLUMN "db_backups"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "db_backups"."created_at" IS '创建时间';
COMMENT ON COLUMN "db_backups"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── db_admin_query_history SQL 控制台历史 ──────────────────────────────────
COMMENT ON TABLE "db_admin_query_history" IS '数据库管理员 SQL 控制台查询历史';
COMMENT ON COLUMN "db_admin_query_history"."id" IS '主键 ID';
COMMENT ON COLUMN "db_admin_query_history"."user_id" IS '执行用户 ID';
COMMENT ON COLUMN "db_admin_query_history"."sql_text" IS '执行的 SQL';
COMMENT ON COLUMN "db_admin_query_history"."duration_ms" IS '耗时（毫秒）';
COMMENT ON COLUMN "db_admin_query_history"."row_count" IS '返回/影响行数';
COMMENT ON COLUMN "db_admin_query_history"."success" IS '是否执行成功';
COMMENT ON COLUMN "db_admin_query_history"."error_message" IS '错误信息';
COMMENT ON COLUMN "db_admin_query_history"."executed_at" IS '执行时间';
--> statement-breakpoint

-- ─── user_api_tokens 个人 API Token ─────────────────────────────────────────
COMMENT ON TABLE "user_api_tokens" IS '用户个人 API Token 表';
COMMENT ON COLUMN "user_api_tokens"."id" IS '主键 ID';
COMMENT ON COLUMN "user_api_tokens"."user_id" IS '所属用户 ID';
COMMENT ON COLUMN "user_api_tokens"."name" IS 'Token 名称（标识用途）';
COMMENT ON COLUMN "user_api_tokens"."token" IS 'Token 值（全局唯一）';
COMMENT ON COLUMN "user_api_tokens"."last_used_at" IS '最近使用时间';
COMMENT ON COLUMN "user_api_tokens"."expires_at" IS '过期时间（NULL 表示永久）';
COMMENT ON COLUMN "user_api_tokens"."created_by" IS '创建人';
COMMENT ON COLUMN "user_api_tokens"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "user_api_tokens"."created_at" IS '创建时间';
COMMENT ON COLUMN "user_api_tokens"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── password_reset_tokens 密码重置 Token ───────────────────────────────────
COMMENT ON TABLE "password_reset_tokens" IS '密码重置 Token 表';
COMMENT ON COLUMN "password_reset_tokens"."id" IS '主键 ID';
COMMENT ON COLUMN "password_reset_tokens"."user_id" IS '关联用户 ID';
COMMENT ON COLUMN "password_reset_tokens"."token" IS '重置 Token（全局唯一）';
COMMENT ON COLUMN "password_reset_tokens"."expires_at" IS '过期时间';
COMMENT ON COLUMN "password_reset_tokens"."used_at" IS '使用时间（NULL 表示未使用）';
COMMENT ON COLUMN "password_reset_tokens"."created_at" IS '签发时间';
--> statement-breakpoint

-- ─── rate_limit_rules 限流规则 ──────────────────────────────────────────────
COMMENT ON TABLE "rate_limit_rules" IS '接口限流规则表';
COMMENT ON COLUMN "rate_limit_rules"."id" IS '主键 ID';
COMMENT ON COLUMN "rate_limit_rules"."name" IS '规则名称（全局唯一）';
COMMENT ON COLUMN "rate_limit_rules"."description" IS '规则描述';
COMMENT ON COLUMN "rate_limit_rules"."window_ms" IS '时间窗口（毫秒）';
COMMENT ON COLUMN "rate_limit_rules"."limit" IS '窗口内最大请求次数';
COMMENT ON COLUMN "rate_limit_rules"."key_type" IS '限流键类型：ip/user/ip_path';
COMMENT ON COLUMN "rate_limit_rules"."enabled" IS '是否启用';
COMMENT ON COLUMN "rate_limit_rules"."blocked_message" IS '触发限流时返回的提示文案';
COMMENT ON COLUMN "rate_limit_rules"."created_by" IS '创建人';
COMMENT ON COLUMN "rate_limit_rules"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "rate_limit_rules"."created_at" IS '创建时间';
COMMENT ON COLUMN "rate_limit_rules"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── email_templates 邮件模板 ───────────────────────────────────────────────
COMMENT ON TABLE "email_templates" IS '邮件模板表';
COMMENT ON COLUMN "email_templates"."id" IS '主键 ID';
COMMENT ON COLUMN "email_templates"."name" IS '模板名称';
COMMENT ON COLUMN "email_templates"."code" IS '模板编码（全局唯一）';
COMMENT ON COLUMN "email_templates"."subject" IS '邮件主题（支持变量）';
COMMENT ON COLUMN "email_templates"."content" IS '邮件正文（HTML/支持变量）';
COMMENT ON COLUMN "email_templates"."variables" IS '变量定义（JSON）';
COMMENT ON COLUMN "email_templates"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "email_templates"."remark" IS '备注';
COMMENT ON COLUMN "email_templates"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "email_templates"."created_by" IS '创建人';
COMMENT ON COLUMN "email_templates"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "email_templates"."created_at" IS '创建时间';
COMMENT ON COLUMN "email_templates"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── email_send_logs 邮件发送记录 ───────────────────────────────────────────
COMMENT ON TABLE "email_send_logs" IS '邮件发送记录表';
COMMENT ON COLUMN "email_send_logs"."id" IS '主键 ID';
COMMENT ON COLUMN "email_send_logs"."template_id" IS '使用的模板 ID';
COMMENT ON COLUMN "email_send_logs"."to_email" IS '收件人邮箱';
COMMENT ON COLUMN "email_send_logs"."subject" IS '实际发送主题';
COMMENT ON COLUMN "email_send_logs"."content" IS '实际发送正文';
COMMENT ON COLUMN "email_send_logs"."status" IS '发送状态：pending/success/failed';
COMMENT ON COLUMN "email_send_logs"."error_msg" IS '失败原因';
COMMENT ON COLUMN "email_send_logs"."source" IS '触发来源：manual/test/system/api';
COMMENT ON COLUMN "email_send_logs"."user_id" IS '触发用户 ID';
COMMENT ON COLUMN "email_send_logs"."ip" IS '触发 IP';
COMMENT ON COLUMN "email_send_logs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "email_send_logs"."sent_at" IS '发送完成时间';
COMMENT ON COLUMN "email_send_logs"."created_at" IS '记录创建时间';
--> statement-breakpoint

-- ─── sms_configs 短信服务商配置 ─────────────────────────────────────────────
COMMENT ON TABLE "sms_configs" IS '短信服务商配置表';
COMMENT ON COLUMN "sms_configs"."id" IS '主键 ID';
COMMENT ON COLUMN "sms_configs"."name" IS '配置名称';
COMMENT ON COLUMN "sms_configs"."provider" IS '服务商：aliyun/tencent';
COMMENT ON COLUMN "sms_configs"."access_key_id" IS 'AccessKeyId';
COMMENT ON COLUMN "sms_configs"."access_key_secret" IS 'AccessKeySecret';
COMMENT ON COLUMN "sms_configs"."region" IS '区域';
COMMENT ON COLUMN "sms_configs"."sign_name" IS '默认短信签名';
COMMENT ON COLUMN "sms_configs"."is_default" IS '是否默认配置';
COMMENT ON COLUMN "sms_configs"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "sms_configs"."remark" IS '备注';
COMMENT ON COLUMN "sms_configs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "sms_configs"."created_by" IS '创建人';
COMMENT ON COLUMN "sms_configs"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "sms_configs"."created_at" IS '创建时间';
COMMENT ON COLUMN "sms_configs"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── sms_templates 短信模板 ─────────────────────────────────────────────────
COMMENT ON TABLE "sms_templates" IS '短信模板表';
COMMENT ON COLUMN "sms_templates"."id" IS '主键 ID';
COMMENT ON COLUMN "sms_templates"."name" IS '模板名称';
COMMENT ON COLUMN "sms_templates"."code" IS '模板编码（全局唯一）';
COMMENT ON COLUMN "sms_templates"."template_code" IS '服务商侧模板 Code';
COMMENT ON COLUMN "sms_templates"."sign_name" IS '签名（可覆盖配置默认值）';
COMMENT ON COLUMN "sms_templates"."content" IS '模板内容（支持变量）';
COMMENT ON COLUMN "sms_templates"."variables" IS '变量定义（JSON）';
COMMENT ON COLUMN "sms_templates"."provider" IS '所属服务商：aliyun/tencent';
COMMENT ON COLUMN "sms_templates"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "sms_templates"."remark" IS '备注';
COMMENT ON COLUMN "sms_templates"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "sms_templates"."created_by" IS '创建人';
COMMENT ON COLUMN "sms_templates"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "sms_templates"."created_at" IS '创建时间';
COMMENT ON COLUMN "sms_templates"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── sms_send_logs 短信发送记录 ─────────────────────────────────────────────
COMMENT ON TABLE "sms_send_logs" IS '短信发送记录表';
COMMENT ON COLUMN "sms_send_logs"."id" IS '主键 ID';
COMMENT ON COLUMN "sms_send_logs"."config_id" IS '使用的服务商配置 ID';
COMMENT ON COLUMN "sms_send_logs"."template_id" IS '使用的模板 ID';
COMMENT ON COLUMN "sms_send_logs"."provider" IS '服务商：aliyun/tencent';
COMMENT ON COLUMN "sms_send_logs"."phone" IS '接收手机号';
COMMENT ON COLUMN "sms_send_logs"."content" IS '实际发送内容';
COMMENT ON COLUMN "sms_send_logs"."status" IS '发送状态：pending/success/failed';
COMMENT ON COLUMN "sms_send_logs"."error_msg" IS '失败原因';
COMMENT ON COLUMN "sms_send_logs"."biz_id" IS '服务商业务流水号';
COMMENT ON COLUMN "sms_send_logs"."delivery_status" IS '终端送达状态';
COMMENT ON COLUMN "sms_send_logs"."delivered_at" IS '终端送达时间';
COMMENT ON COLUMN "sms_send_logs"."source" IS '触发来源：manual/test/system/api';
COMMENT ON COLUMN "sms_send_logs"."user_id" IS '触发用户 ID';
COMMENT ON COLUMN "sms_send_logs"."ip" IS '触发 IP';
COMMENT ON COLUMN "sms_send_logs"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "sms_send_logs"."sent_at" IS '发送完成时间';
COMMENT ON COLUMN "sms_send_logs"."created_at" IS '记录创建时间';
--> statement-breakpoint

-- ─── in_app_templates 站内信模板 ────────────────────────────────────────────
COMMENT ON TABLE "in_app_templates" IS '站内信模板表';
COMMENT ON COLUMN "in_app_templates"."id" IS '主键 ID';
COMMENT ON COLUMN "in_app_templates"."name" IS '模板名称';
COMMENT ON COLUMN "in_app_templates"."code" IS '模板编码（全局唯一）';
COMMENT ON COLUMN "in_app_templates"."title" IS '消息标题（支持变量）';
COMMENT ON COLUMN "in_app_templates"."content" IS '消息内容（支持变量）';
COMMENT ON COLUMN "in_app_templates"."type" IS '消息类型：info/success/warning/error';
COMMENT ON COLUMN "in_app_templates"."variables" IS '变量定义（JSON）';
COMMENT ON COLUMN "in_app_templates"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "in_app_templates"."remark" IS '备注';
COMMENT ON COLUMN "in_app_templates"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "in_app_templates"."created_by" IS '创建人';
COMMENT ON COLUMN "in_app_templates"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "in_app_templates"."created_at" IS '创建时间';
COMMENT ON COLUMN "in_app_templates"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── in_app_messages 站内信收件记录 ─────────────────────────────────────────
COMMENT ON TABLE "in_app_messages" IS '站内信收件记录表';
COMMENT ON COLUMN "in_app_messages"."id" IS '主键 ID';
COMMENT ON COLUMN "in_app_messages"."template_id" IS '使用的模板 ID';
COMMENT ON COLUMN "in_app_messages"."user_id" IS '接收用户 ID';
COMMENT ON COLUMN "in_app_messages"."title" IS '消息标题';
COMMENT ON COLUMN "in_app_messages"."content" IS '消息内容';
COMMENT ON COLUMN "in_app_messages"."type" IS '消息类型：info/success/warning/error';
COMMENT ON COLUMN "in_app_messages"."is_read" IS '是否已读';
COMMENT ON COLUMN "in_app_messages"."read_at" IS '阅读时间';
COMMENT ON COLUMN "in_app_messages"."source" IS '触发来源：manual/test/system/api';
COMMENT ON COLUMN "in_app_messages"."sender_id" IS '发送者用户 ID';
COMMENT ON COLUMN "in_app_messages"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "in_app_messages"."created_at" IS '创建时间';
--> statement-breakpoint

-- ─── tags 标签 ──────────────────────────────────────────────────────────────
COMMENT ON TABLE "tags" IS '标签表';
COMMENT ON COLUMN "tags"."id" IS '主键 ID';
COMMENT ON COLUMN "tags"."name" IS '标签名称（全局唯一）';
COMMENT ON COLUMN "tags"."color" IS '展示颜色';
COMMENT ON COLUMN "tags"."group_name" IS '所属分组';
COMMENT ON COLUMN "tags"."description" IS '描述';
COMMENT ON COLUMN "tags"."status" IS '状态：enabled/disabled';
COMMENT ON COLUMN "tags"."sort_order" IS '排序值';
COMMENT ON COLUMN "tags"."created_by" IS '创建人';
COMMENT ON COLUMN "tags"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "tags"."created_at" IS '创建时间';
COMMENT ON COLUMN "tags"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── workflow_definitions 流程定义 ──────────────────────────────────────────
COMMENT ON TABLE "workflow_definitions" IS '工作流定义表';
COMMENT ON COLUMN "workflow_definitions"."id" IS '主键 ID';
COMMENT ON COLUMN "workflow_definitions"."name" IS '流程名称';
COMMENT ON COLUMN "workflow_definitions"."description" IS '流程描述';
COMMENT ON COLUMN "workflow_definitions"."flow_data" IS 'React Flow 节点+边 JSON';
COMMENT ON COLUMN "workflow_definitions"."form_fields" IS '表单字段配置 JSON';
COMMENT ON COLUMN "workflow_definitions"."status" IS '状态：draft/published/disabled';
COMMENT ON COLUMN "workflow_definitions"."version" IS '版本号';
COMMENT ON COLUMN "workflow_definitions"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "workflow_definitions"."created_by" IS '创建人';
COMMENT ON COLUMN "workflow_definitions"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "workflow_definitions"."created_at" IS '创建时间';
COMMENT ON COLUMN "workflow_definitions"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── workflow_instances 流程实例 ────────────────────────────────────────────
COMMENT ON TABLE "workflow_instances" IS '工作流实例表';
COMMENT ON COLUMN "workflow_instances"."id" IS '主键 ID';
COMMENT ON COLUMN "workflow_instances"."definition_id" IS '关联流程定义 ID';
COMMENT ON COLUMN "workflow_instances"."definition_snapshot" IS '发起时的定义快照（JSON）';
COMMENT ON COLUMN "workflow_instances"."title" IS '实例标题';
COMMENT ON COLUMN "workflow_instances"."form_data" IS '表单数据（JSON）';
COMMENT ON COLUMN "workflow_instances"."status" IS '状态：draft/running/approved/rejected/withdrawn';
COMMENT ON COLUMN "workflow_instances"."current_node_key" IS '当前节点 key';
COMMENT ON COLUMN "workflow_instances"."initiator_id" IS '发起人用户 ID';
COMMENT ON COLUMN "workflow_instances"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "workflow_instances"."created_by" IS '创建人';
COMMENT ON COLUMN "workflow_instances"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "workflow_instances"."created_at" IS '创建时间';
COMMENT ON COLUMN "workflow_instances"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── workflow_tasks 审批任务 ────────────────────────────────────────────────
COMMENT ON TABLE "workflow_tasks" IS '工作流审批任务表';
COMMENT ON COLUMN "workflow_tasks"."id" IS '主键 ID';
COMMENT ON COLUMN "workflow_tasks"."instance_id" IS '关联流程实例 ID';
COMMENT ON COLUMN "workflow_tasks"."node_key" IS '节点 key';
COMMENT ON COLUMN "workflow_tasks"."node_name" IS '节点名称快照';
COMMENT ON COLUMN "workflow_tasks"."node_type" IS '节点类型：start/approve/end/exclusiveGateway/parallelGateway/ccNode';
COMMENT ON COLUMN "workflow_tasks"."assignee_id" IS '审批人用户 ID';
COMMENT ON COLUMN "workflow_tasks"."status" IS '状态：pending/approved/rejected/skipped';
COMMENT ON COLUMN "workflow_tasks"."comment" IS '审批意见';
COMMENT ON COLUMN "workflow_tasks"."action_at" IS '处理时间';
COMMENT ON COLUMN "workflow_tasks"."created_at" IS '创建时间';
--> statement-breakpoint

-- ─── chat_conversations 聊天会话 ────────────────────────────────────────────
COMMENT ON TABLE "chat_conversations" IS '聊天会话表';
COMMENT ON COLUMN "chat_conversations"."id" IS '主键 ID';
COMMENT ON COLUMN "chat_conversations"."type" IS '会话类型：direct 单聊 / group 群聊';
COMMENT ON COLUMN "chat_conversations"."name" IS '会话名称（群聊用）';
COMMENT ON COLUMN "chat_conversations"."announcement" IS '群公告';
COMMENT ON COLUMN "chat_conversations"."tenant_id" IS '所属租户 ID';
COMMENT ON COLUMN "chat_conversations"."created_by" IS '创建人';
COMMENT ON COLUMN "chat_conversations"."updated_by" IS '最后更新人';
COMMENT ON COLUMN "chat_conversations"."created_at" IS '创建时间';
COMMENT ON COLUMN "chat_conversations"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── chat_conversation_members 聊天会话成员 ─────────────────────────────────
COMMENT ON TABLE "chat_conversation_members" IS '聊天会话成员表';
COMMENT ON COLUMN "chat_conversation_members"."conversation_id" IS '会话 ID';
COMMENT ON COLUMN "chat_conversation_members"."user_id" IS '成员用户 ID';
COMMENT ON COLUMN "chat_conversation_members"."role" IS '成员角色：owner/member';
COMMENT ON COLUMN "chat_conversation_members"."is_pinned" IS '是否置顶';
COMMENT ON COLUMN "chat_conversation_members"."is_starred" IS '是否标星';
COMMENT ON COLUMN "chat_conversation_members"."is_muted" IS '是否免打扰';
COMMENT ON COLUMN "chat_conversation_members"."last_read_at" IS '最近一次已读时间';
COMMENT ON COLUMN "chat_conversation_members"."joined_at" IS '加入时间';
--> statement-breakpoint

-- ─── chat_messages 聊天消息 ─────────────────────────────────────────────────
COMMENT ON TABLE "chat_messages" IS '聊天消息表';
COMMENT ON COLUMN "chat_messages"."id" IS '主键 ID';
COMMENT ON COLUMN "chat_messages"."conversation_id" IS '所属会话 ID';
COMMENT ON COLUMN "chat_messages"."sender_id" IS '发送者用户 ID';
COMMENT ON COLUMN "chat_messages"."type" IS '消息类型：text/image/file/system/forward/vote';
COMMENT ON COLUMN "chat_messages"."content" IS '消息正文';
COMMENT ON COLUMN "chat_messages"."reply_to_id" IS '引用回复的消息 ID';
COMMENT ON COLUMN "chat_messages"."is_recalled" IS '是否已撤回';
COMMENT ON COLUMN "chat_messages"."is_edited" IS '是否被编辑';
COMMENT ON COLUMN "chat_messages"."extra" IS '附加信息（JSON：图片/文件元数据等）';
COMMENT ON COLUMN "chat_messages"."created_at" IS '发送时间';
COMMENT ON COLUMN "chat_messages"."updated_at" IS '更新时间';
--> statement-breakpoint

-- ─── chat_message_reactions 聊天消息表情回应 ────────────────────────────────
COMMENT ON TABLE "chat_message_reactions" IS '聊天消息表情回应表';
COMMENT ON COLUMN "chat_message_reactions"."id" IS '主键 ID';
COMMENT ON COLUMN "chat_message_reactions"."message_id" IS '消息 ID';
COMMENT ON COLUMN "chat_message_reactions"."user_id" IS '回应用户 ID';
COMMENT ON COLUMN "chat_message_reactions"."emoji" IS '表情字符';
COMMENT ON COLUMN "chat_message_reactions"."created_at" IS '创建时间';
