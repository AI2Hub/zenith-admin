<script setup lang="ts">
import { withBase } from 'vitepress'

const layers = [
  {
    name: 'Backend',
    items: [
      ['Hono', 'v4'],
      ['Node.js', '24'],
      ['Drizzle ORM', 'PostgreSQL'],
      ['Redis', '会话 · 限流 · 幂等'],
      ['pg-boss', '任务队列'],
      ['Mastra', 'AI 运行时'],
    ],
  },
  {
    name: 'Frontend',
    items: [
      ['React', '19'],
      ['Vite', '8'],
      ['Semi Design', 'v2'],
      ['React Router', 'v7'],
      ['TanStack Query', 'v5'],
      ['lucide-react', '图标'],
    ],
  },
  {
    name: 'Engineering',
    items: [
      ['npm monorepo', '5 工作区'],
      ['Zod', '前后端共享校验'],
      ['OpenAPI / Swagger', '自动生成'],
      ['MSW', 'Demo 模式'],
      ['OpenTelemetry', '可观测'],
      ['Electron', '桌面端'],
    ],
  },
]
</script>

<template>
  <section class="stack">
    <div class="zn-section-head">
      <span class="zn-eyebrow">技术栈</span>
      <h2 class="zn-h2">成熟组合，稳定演进</h2>
      <p class="zn-sub">
        <code>shared</code> 位于依赖图底部统一契约，<code>server</code> 是业务权威边界，<code>web</code> 只负责交互；依赖单向流动，前后端不直接导入彼此代码。
        <a :href="withBase('/guide/project-structure')">了解项目结构 →</a>
      </p>
    </div>
    <div class="layers">
      <div v-for="layer in layers" :key="layer.name" class="layer">
        <h3>{{ layer.name }}</h3>
        <ul>
          <li v-for="[name, note] in layer.items" :key="name">
            <span>{{ name }}</span><small>{{ note }}</small>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stack {
  max-width: 1160px;
  margin: 0 auto;
  padding: 88px 24px 0;
}

.layers {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0;
  margin-top: 40px;
  border-top: 1px solid var(--zn-line);
  border-bottom: 1px solid var(--zn-line);
}

.layer {
  padding: 24px 24px 20px;
}

.layer + .layer {
  border-left: 1px solid var(--zn-line);
}

.layer h3 {
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--zn-text-3);
}

.layer ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.layer li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--zn-line);
  font-size: 14px;
  color: var(--zn-text-1);
}

.layer li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.layer li small {
  font-size: 12.5px;
  color: var(--zn-text-3);
  text-align: right;
}

.zn-sub a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}

.zn-sub a:hover {
  text-decoration: underline;
}

@media (max-width: 960px) {
  .layers {
    grid-template-columns: 1fr;
  }

  .layer + .layer {
    border-top: 1px solid var(--zn-line);
    border-left: 0;
  }
}

@media (max-width: 640px) {
  .stack {
    padding: 64px 16px 0;
  }
}
</style>
