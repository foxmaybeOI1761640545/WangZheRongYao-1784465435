# 王者多账号管理器

Vue 3 + Vite 多账号分组管理应用，支持递归分组、区服资料维护、本地 JSON 导出与 GitHub 独立分支备份。

## 开发

```bash
npm ci
npm run dev
```

## 构建

```bash
npm run build
npm run preview
```

## 数据与备份

页面顶部的“数据与备份”入口提供：

- 导出完整 JSON 文件；
- 从 JSON 文件覆盖恢复；
- 使用 GitHub 用户名、仓库名、分支名、根目录和 PAT 创建时间戳备份文件；
- 将仓库配置保存在当前浏览器；
- 可选在当前浏览器的 localStorage 中保存 PAT，避免每次重新输入；
- 一键清除已保存 PAT；
- 直接打开当前配置对应的 GitHub 备份目录。

默认备份目标：

```text
仓库：https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435
分支：backup/1784534225/AccountData
目录：AccountData01
目录链接：https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/tree/backup/1784534225/AccountData/AccountData01
```

PAT 保存到 localStorage 时不会加密，只应在个人可信设备使用。PAT 不会进入导出 JSON、账号备份文件或 GitHub 提交信息。

详细说明见 [数据导出与 GitHub 备份](docs/BACKUP.md)。