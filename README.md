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
- 只持久化非敏感 GitHub 配置，PAT 仅保留在当前弹窗内存中。

默认备份目标：

```text
仓库：https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435
分支：backup/1784534225/AccountData
目录：AccountData01
```

详细说明见 [数据导出与 GitHub 备份](docs/BACKUP.md)。
