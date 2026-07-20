# Vue 3 + Vite + GitHub Pages 项目模板

这个分支把原业务项目整理成一个可复用的通用 Demo，目标是让后续同技术栈项目能够直接复制目录结构、开发约定和自动化流程。

## 技术栈

- Vue 3 Composition API
- Vite
- 原生 CSS
- GitHub Actions
- GitHub Pages
- GitHub Releases

## 快速开始

```bash
npm ci
npm run dev
```

生产构建与本地预览：

```bash
npm run build
npm run preview
```

## 目录结构

```text
.
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml
│  │  ├─ deploy-pages.yml
│  │  └─ release.yml
│  └─ pull_request_template.md
├─ docs/
│  ├─ ARCHITECTURE.md
│  ├─ DEVELOPMENT.md
│  ├─ BUILD_AND_DEPLOY.md
│  ├─ RELEASE.md
│  ├─ COMMIT_CONVENTION.md
│  └─ ADOPTION_CHECKLIST.md
├─ public/
│  └─ favicon.svg
├─ src/
│  ├─ components/
│  │  └─ DemoCard.vue
│  ├─ composables/
│  │  └─ usePersistentState.js
│  ├─ data/
│  │  └─ stack.js
│  ├─ App.vue
│  ├─ main.js
│  └─ style.css
├─ .editorconfig
├─ .env.example
├─ index.html
├─ package.json
└─ vite.config.js
```

## 自动化流程

| 场景 | 工作流 | 结果 |
|---|---|---|
| 推送到 `main` 或 `future/**` | `ci.yml` | 安装依赖、构建并上传短期构建产物 |
| 推送到 `main` | `deploy-pages.yml` | 使用官方 Pages Actions 构建并部署 |
| 推送 `v*` 标签 | `release.yml` | 构建、压缩 `dist` 并创建 GitHub Release |

## GitHub Pages 设置

首次使用时进入：

`Settings → Pages → Build and deployment → Source`

选择 **GitHub Actions**。模板不需要 PAT，发布使用 GitHub 自动生成的短期令牌和 OIDC 权限。

## 基础路径

`vite.config.js` 会按以下顺序决定 `base`：

1. 存在 `VITE_BASE_PATH` 时使用该值；
2. GitHub Actions 中自动读取 `GITHUB_REPOSITORY`；
3. 普通项目 Pages 自动使用 `/<repository-name>/`；
4. `<account>.github.io` 仓库自动使用 `/`；
5. 本地开发默认使用 `/`。

因此复制到其他仓库后通常不需要修改配置。

## 文档入口

- [架构拆解](docs/ARCHITECTURE.md)
- [开发流程](docs/DEVELOPMENT.md)
- [构建与部署](docs/BUILD_AND_DEPLOY.md)
- [版本发布](docs/RELEASE.md)
- [提交规范](docs/COMMIT_CONVENTION.md)
- [新项目采用清单](docs/ADOPTION_CHECKLIST.md)
