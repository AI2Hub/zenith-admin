<script setup lang="ts">
import { withBase } from 'vitepress'

const demoUrl = 'https://iwangbowen.github.io/zenith-admin/demo/'
</script>

<template>
  <section class="cta-wrap">
    <div class="cta">
      <div>
        <h2 class="zn-h2">现在就打开在线演示</h2>
        <p>无需后端，账号 <code>admin</code> / <code>123456</code>，体验全部 16 个业务域。</p>
      </div>
      <div class="cta__actions">
        <a class="zn-btn zn-btn--primary" :href="demoUrl" target="_blank" rel="noreferrer">打开演示 →</a>
        <a class="zn-btn zn-btn--ghost" :href="withBase('/guide/getting-started')">阅读文档</a>
      </div>
    </div>
  </section>
</template>

<style scoped>
.cta-wrap {
  max-width: 1160px;
  margin: 0 auto;
  padding: 88px 24px 96px;
}

.cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 36px 0;
  border-top: 1px solid var(--zn-line);
  border-bottom: 1px solid var(--zn-line);
}

.cta .zn-h2 {
  font-size: 28px;
}

.cta p {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--zn-text-2);
}

.cta code {
  padding: 1px 6px;
  border: 1px solid var(--zn-line);
  border-radius: 5px;
  background: var(--zn-card-2);
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  color: var(--zn-text-1);
}

.cta__actions {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  gap: 12px;
}

@media (max-width: 760px) {
  .cta-wrap {
    padding: 64px 16px 72px;
  }

  .cta {
    flex-direction: column;
    align-items: flex-start;
    padding: 32px 0;
  }
}
</style>
