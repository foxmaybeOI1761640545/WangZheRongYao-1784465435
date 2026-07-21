# 王者多账号管理器

Vue 3 + Vite 多账号分组管理应用，支持递归分组、区服资料维护、本地 JSON 导出、GitHub 独立分支备份以及 Capacitor Android 原生封装。

## Web 开发

```bash
npm install
npm run dev
```

## Web 构建

```bash
npm run build
npm run preview
```

## Android 开发

安卓端采用 Vue 3 + Vite + Capacitor 7，固定包名：

```text
com.foxmaybe.wangzheaccountmanager
```

常用命令：

```bash
npm install
npm run sync:android
npm run android:debug
npm run android:open
```

Android 版本包含：

- 系统返回键按弹窗、编辑态、上一页面顺序处理；
- 普通输入框按回车跳转到下一字段，最后字段提交；
- `adjustResize`、动态视口和安全区域适配；
- 软键盘压缩高度时自动收紧固定区域；
- Debug APK 自动构建校验；
- 使用固定 Repository Secrets 签名 APK 与 AAB 并发布 GitHub Release。

详细说明见：

- [Android 工程与交互说明](docs/ANDROID.md)
- [Android 固定签名配置](docs/ANDROID_SIGNING.md)

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
