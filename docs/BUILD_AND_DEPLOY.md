# 构建与部署

## 1. 本地生产构建

```bash
npm ci
npm run build
```

输出目录为 `dist/`。构建完成后使用：

```bash
npm run preview
```

不要直接双击 `dist/index.html` 验证，因为 `file://` 协议与真实 HTTP 托管行为不同。

## 2. Vite 基础路径

GitHub 项目 Pages 的地址通常为：

```text
https://<account>.github.io/<repository>/
```

因此资源地址必须包含仓库名。模板在 GitHub Actions 中读取 `GITHUB_REPOSITORY` 自动计算，不需要硬编码仓库名称。

也可以显式覆盖：

```bash
VITE_BASE_PATH=/custom-path/ npm run build
```

PowerShell：

```powershell
$env:VITE_BASE_PATH="/custom-path/"
npm run build
```

## 3. CI 工作流

`.github/workflows/ci.yml` 在以下情况运行：

- 推送到 `main`；
- 推送到 `future/**`；
- 面向 `main` 的拉取请求。

流程：

```text
checkout
  → setup-node
  → npm ci
  → npm run build
  → upload-artifact
```

上传的 `dist` 仅保留 7 天，用于审查，不负责线上部署。

## 4. Pages 部署工作流

`.github/workflows/deploy-pages.yml` 只在 `main` 或手动触发时运行。

它使用 GitHub 官方流程：

```text
build job
  → configure-pages
  → npm ci
  → npm run build
  → upload-pages-artifact

deploy job
  → deploy-pages
```

需要的权限：

- `contents: read`
- `pages: write`
- `id-token: write`

这种方式不需要 PAT，也不需要维护 `gh-pages` 分支。

## 5. 仓库设置

进入：

`Settings → Pages → Build and deployment`

将 Source 设置为 **GitHub Actions**。

如果仓库仍配置为 “Deploy from a branch”，官方部署工作流不会成为当前 Pages 来源。

## 6. 常见空白页排查

依次检查：

1. `dist/index.html` 中 JS/CSS 地址是否包含正确仓库路径；
2. 浏览器 Network 中是否有 404；
3. Console 是否有 JavaScript 运行错误；
4. Pages Source 是否为 GitHub Actions；
5. workflow 是否成功上传并部署 artifact；
6. 自定义域名时 `VITE_BASE_PATH` 是否应该为 `/`；
7. 缓存是否仍在使用旧 HTML。

## 7. 回滚

最安全方式是回滚 `main` 到上一个正常提交并重新触发部署。也可以在 Actions 中重新运行旧提交对应的工作流，但长期应确保仓库当前代码本身可重新构建。
