# 开发流程

## 1. 环境要求

- Node.js 22
- npm
- Git

推荐使用与工作流一致的 Node.js 版本，避免本地构建和 CI 结果不同。

## 2. 安装依赖

```bash
npm ci
```

日常开发优先使用 `npm ci`，它严格依据 `package-lock.json` 安装。只有在新增、删除或升级依赖时使用 `npm install` 并提交锁文件变化。

## 3. 启动开发服务器

```bash
npm run dev
```

Vite 默认开启热更新。修改组件、样式或数据模块后，页面会自动刷新。

## 4. 开发顺序

1. 明确功能输入、输出和错误情况；
2. 决定状态属于页面、组件还是 composable；
3. 先完成最小交互；
4. 补充响应式布局和可访问性属性；
5. 执行生产构建；
6. 提交小而清晰的变更。

## 5. 新增功能的推荐目录

```text
src/
├─ components/     # 可复用界面
├─ composables/    # 可复用响应式逻辑
├─ data/           # 静态数据
├─ services/       # HTTP 或浏览器服务封装
├─ utils/          # 无状态纯函数
└─ views/          # 引入 Router 后的页面
```

不要为了目录完整而提前创建空目录；功能出现时再增加。

## 6. 环境配置

复制示例文件：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

本地环境文件不应提交。只有不敏感、所有环境都能公开的信息才可使用 `VITE_` 变量。

## 7. 完成前检查

```bash
npm run check
```

同时手动检查：

- 桌面端和移动端；
- 键盘操作；
- 空值和异常输入；
- 浏览器控制台；
- 刷新后状态；
- 直接访问 Pages 子路径时的资源加载。
