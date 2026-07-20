# 新项目采用清单

## 项目标识

- [ ] 修改 `package.json` 的名称和版本
- [ ] 修改 `index.html` 标题、描述和主题色
- [ ] 替换 favicon
- [ ] 更新 README 中的项目介绍

## 代码结构

- [ ] 删除 Demo 专用组件和数据
- [ ] 创建真实业务组件
- [ ] 把可复用状态逻辑放入 composables
- [ ] 把接口访问放入 services
- [ ] 明确是否需要 Router、Pinia 或测试框架

## 配置

- [ ] 复制 `.env.example`
- [ ] 确认所有 `VITE_` 变量都可公开
- [ ] 不把 PAT、API 私钥或数据库密码写入前端环境变量
- [ ] 确认 `vite.config.js` 的自动 base 逻辑适用

## GitHub

- [ ] 默认分支设置为 `main`
- [ ] Pages Source 设置为 GitHub Actions
- [ ] Actions 允许读取仓库并写入 Pages
- [ ] 保护 `main`，要求 PR 和 CI
- [ ] 检查 Release 工作流的 `contents: write` 权限
- [ ] 删除不再需要的临时 Secrets

## 验证

- [ ] `npm ci`
- [ ] `npm run build`
- [ ] `npm run preview`
- [ ] 桌面端检查
- [ ] 移动端检查
- [ ] 浏览器 Console 无错误
- [ ] Pages 网络请求无 404
- [ ] 创建测试标签验证 Release
