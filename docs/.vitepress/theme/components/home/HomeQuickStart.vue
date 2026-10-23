<script setup lang="ts">
import { withBase } from 'vitepress'
</script>

<template>
  <section class="qs">
    <div class="zn-section-head">
      <span class="zn-eyebrow">快速开始</span>
      <h2 class="zn-h2">三步启动完整开发环境</h2>
      <p class="zn-sub">
        PostgreSQL + Redis 就绪后（也可用 <code>docker-compose.dev.yml</code> 一键拉起），克隆、初始化、启动。Server 与 Web 同时拉起。
      </p>
    </div>
    <div class="steps">
      <div class="step">
        <span class="step__n">1</span>
        <h3>克隆并安装</h3>
        <p>npm monorepo，一次安装全部工作区依赖。</p>
        <pre>git clone https://github.com/iwangbowen/zenith-admin
cd zenith-admin &amp;&amp; npm install</pre>
      </div>
      <div class="step">
        <span class="step__n">2</span>
        <h3>配置并初始化数据库</h3>
        <p>复制环境变量模板，执行迁移并写入菜单、角色与演示数据。</p>
        <pre>cp packages/server/.env.example packages/server/.env
npm run db:migrate &amp;&amp; npm run db:seed</pre>
      </div>
      <div class="step">
        <span class="step__n">3</span>
        <h3>启动</h3>
        <p>同时启动 Hono API 与 React 前端，默认管理员 admin / 123456。</p>
        <pre>npm run dev
<span class="d"># API :3300 · Web :5373 · Swagger /api/docs</span></pre>
      </div>
    </div>
    <p class="qs__more">
      更多细节见 <a :href="withBase('/guide/getting-started')">快速开始</a>、<a :href="withBase('/guide/docker')">Docker 部署</a> 与 <a :href="withBase('/guide/demo-mode')">Demo 演示模式</a>。
    </p>
  </section>
</template>

<style scoped>
.qs {
  max-width: 1160px;
  margin: 0 auto;
  padding: 88px 24px 0;
}

.steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin-top: 40px;
  padding: 28px 0;
  border-top: 1px solid var(--zn-line);
  border-bottom: 1px solid var(--zn-line);
}

.step {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 24px;
}

.step:first-child {
  padding-left: 0;
}

.step:last-child {
  padding-right: 0;
}

.step + .step {
  border-left: 1px solid var(--zn-line);
}

.step__n {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--zn-text-1);
  color: var(--zn-card);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  font-weight: 700;
}

.step h3 {
  margin: 4px 0 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--zn-text-1);
}

.step p {
  margin: 0;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--zn-text-2);
}

.step pre {
  margin: auto 0 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--zn-dark);
  color: var(--zn-dark-text);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.step pre .d {
  color: var(--zn-dark-text-2);
}

.qs__more {
  margin: 20px 0 0;
  font-size: 13.5px;
  color: var(--zn-text-3);
}

.qs__more a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}

.qs__more a:hover {
  text-decoration: underline;
}

@media (max-width: 960px) {
  .steps {
    grid-template-columns: 1fr;
    gap: 0;
  }

  .step,
  .step:first-child,
  .step:last-child {
    padding: 20px 0;
  }

  .step + .step {
    border-top: 1px solid var(--zn-line);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .qs {
    padding: 64px 16px 0;
  }
}
</style>
