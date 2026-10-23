<template>
  <section class="stats-wrap">
    <div class="stats">
      <div><b>16</b><span>业务域纵向切分</span></div>
      <div><b>130+</b><span>开箱可用功能点</span></div>
      <div><b>3</b><span>前端入口：后台 / 会员 / 移动审批</span></div>
      <div><b>9</b><span>种可切换存储后端</span></div>
    </div>
  </section>
</template>

<style scoped>
.stats-wrap {
  max-width: 1160px;
  margin: 14px auto 0;
  padding: 0 24px;
}

.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border-top: 1px solid var(--zn-line);
  border-bottom: 1px solid var(--zn-line);
}

.stats div {
  padding: 24px 20px;
  border-right: 1px solid var(--zn-line);
}

.stats div:last-child {
  border-right: 0;
}

.stats b {
  display: block;
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.1;
  color: var(--zn-text-1);
}

.stats span {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  color: var(--zn-text-2);
}

@media (max-width: 640px) {
  .stats-wrap {
    padding: 0 16px;
  }

  .stats {
    grid-template-columns: 1fr 1fr;
  }

  .stats div {
    padding: 18px 14px;
  }

  .stats div:nth-child(2) {
    border-right: 0;
  }

  .stats div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--zn-line);
  }
}
</style>
