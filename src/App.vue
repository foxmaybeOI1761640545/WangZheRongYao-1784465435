<script setup>
import { computed, ref } from 'vue'
import DemoCard from './components/DemoCard.vue'
import { usePersistentState } from './composables/usePersistentState.js'
import { stackItems } from './data/stack.js'

const counter = usePersistentState('project-template-counter', 0)
const projectName = ref('My Vue App')
const environment = ref('development')
const includeAnalytics = ref(false)

const environmentLabels = {
  development: '开发环境',
  staging: '预发布环境',
  production: '生产环境',
}

const generatedConfig = computed(() => ({
  projectName: projectName.value.trim() || 'Untitled App',
  environment: environment.value,
  environmentLabel: environmentLabels[environment.value],
  analyticsEnabled: includeAnalytics.value,
  generatedAt: new Date().toISOString(),
}))

function resetDemo() {
  counter.value = 0
  projectName.value = 'My Vue App'
  environment.value = 'development'
  includeAnalytics.value = false
}
</script>

<template>
  <main class="page-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Reusable project reference</p>
        <h1>Vue 3 + Vite + GitHub Pages 通用项目模板</h1>
        <p class="hero__description">
          这是一个可直接复制的 Demo：展示组件拆分、响应式状态、计算属性、
          localStorage 持久化、环境配置、CI、Pages 部署和版本发布。
        </p>
      </div>

      <div class="hero__commands" aria-label="快速开始命令">
        <code>npm ci</code>
        <code>npm run dev</code>
        <code>npm run build</code>
      </div>
    </section>

    <section class="content-grid" aria-label="项目模板演示">
      <DemoCard title="响应式状态与持久化" eyebrow="State">
        <p>
          计数器使用自定义 composable 保存到 localStorage，刷新页面后仍会保留。
        </p>

        <div class="counter" aria-live="polite">
          <button type="button" aria-label="减少计数" @click="counter--">−</button>
          <strong>{{ counter }}</strong>
          <button type="button" aria-label="增加计数" @click="counter++">+</button>
        </div>

        <template #footer>
          <code>src/composables/usePersistentState.js</code>
        </template>
      </DemoCard>

      <DemoCard title="表单、计算属性与预览" eyebrow="Composition API">
        <form class="demo-form" @submit.prevent>
          <label>
            项目名称
            <input v-model="projectName" type="text" maxlength="60" />
          </label>

          <label>
            环境
            <select v-model="environment">
              <option value="development">开发环境</option>
              <option value="staging">预发布环境</option>
              <option value="production">生产环境</option>
            </select>
          </label>

          <label class="checkbox-row">
            <input v-model="includeAnalytics" type="checkbox" />
            启用统计功能
          </label>
        </form>

        <pre class="config-preview">{{ JSON.stringify(generatedConfig, null, 2) }}</pre>

        <template #footer>
          <code>src/App.vue</code>
        </template>
      </DemoCard>
    </section>

    <section class="stack-section">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Technology stack</p>
          <h2>当前模板覆盖的技术环节</h2>
        </div>

        <button type="button" class="secondary-button" @click="resetDemo">
          重置示例
        </button>
      </div>

      <div class="stack-grid">
        <article v-for="item in stackItems" :key="item.name" class="stack-item">
          <h3>{{ item.name }}</h3>
          <strong>{{ item.role }}</strong>
          <p>{{ item.detail }}</p>
        </article>
      </div>
    </section>

    <section class="next-steps">
      <h2>复制到新项目时</h2>
      <ol>
        <li>修改 <code>package.json</code>、页面标题和品牌样式。</li>
        <li>按功能拆分 <code>components</code>、<code>composables</code> 与 <code>data</code>。</li>
        <li>在仓库 Pages 设置中选择 <strong>GitHub Actions</strong>。</li>
        <li>推送到 <code>main</code>，由工作流完成构建和部署。</li>
        <li>创建 <code>v1.0.0</code> 标签，自动生成 GitHub Release。</li>
      </ol>
      <p>
        完整拆解请从仓库中的 <code>docs/ARCHITECTURE.md</code> 开始阅读。
      </p>
    </section>
  </main>
</template>
