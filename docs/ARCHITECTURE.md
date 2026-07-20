# 架构拆解

## 1. 运行链路

浏览器首先加载 `index.html`，随后执行 `src/main.js`。`main.js` 创建 Vue 应用并把根组件 `App.vue` 挂载到 `#app`。

```text
index.html
  └─ src/main.js
       ├─ src/App.vue
       └─ src/style.css
```

生产构建时，Vite 会分析这条依赖链，把 JavaScript、CSS 和静态资源输出到 `dist/`。

## 2. 目录职责

### `src/App.vue`

根页面负责组合业务模块，不应承担所有可复用逻辑。当前 Demo 展示：

- `ref`：可变表单状态；
- `computed`：根据表单生成预览；
- 事件处理：按钮和表单交互；
- 子组件：`DemoCard`；
- composable：`usePersistentState`；
- 独立数据模块：`stackItems`。

真实项目中，当某一区块开始拥有独立状态或复杂模板时，应继续拆分为子组件。

### `src/components/`

放置可复用的界面组件。`DemoCard.vue` 展示了：

- `defineProps` 定义组件输入；
- 默认插槽承载主体；
- 具名插槽承载 footer；
- 组件只负责展示结构，不保存页面级业务状态。

### `src/composables/`

放置可复用的响应式逻辑。命名以 `use` 开头。适合封装：

- localStorage；
- 网络请求；
- 媒体查询；
- 权限检查；
- 表单状态；
- 主题切换。

### `src/data/`

放置不会直接操作 DOM 的静态数据和配置。这样能减少组件文件长度，也便于未来替换为接口数据。

### `public/`

文件会按原文件名复制到构建根目录。适合 favicon、robots.txt 等不需要经过打包处理的资源。

## 3. 状态边界

遵循以下优先级：

1. 只在一个组件使用：保留在该组件；
2. 父子组件共享：由父组件持有，通过 props 和事件传递；
3. 多个无直接关系的组件共享：抽成 composable；
4. 大型应用全局共享：再考虑 Pinia 等状态库。

本模板故意不引入 Pinia、Router 或 UI 框架，避免在项目尚未需要时增加复杂度。

## 4. 样式策略

当前使用单一 `style.css`，适合小型项目。规模扩大后建议：

- 全局变量与 reset 保留在 `style.css`；
- 组件样式放入 Vue SFC 的 `<style scoped>`；
- 设计令牌集中为 CSS 自定义属性；
- 避免以页面位置命名，优先按组件职责命名。

## 5. 环境变量

只有以 `VITE_` 开头的变量会暴露给前端代码。不要把密钥、PAT、数据库密码写入 Vite 环境变量，因为构建后访问者可以读取它们。

## 6. 扩展路线

需要多页面导航时，引入 Vue Router；需要复杂全局状态时引入 Pinia；需要接口层时增加 `src/services/`；需要单元测试时增加 Vitest；需要端到端测试时增加 Playwright。
