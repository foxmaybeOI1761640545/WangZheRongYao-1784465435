# Android 工程与交互说明

## 技术栈

- Vue 3.5.39
- Vite 8.1.0
- Capacitor Core / Android 7.6.7
- Capacitor App 7.1.2
- Android Gradle Plugin 8.7.2
- Gradle 8.11.1
- JDK 21
- compileSdk / targetSdk 35
- minSdk 23（Android 6.0）

Android 只负责原生容器、系统栏、软键盘和构建签名。账号树、Hash 路由、编辑、导入导出与 GitHub 备份继续由 Vue 层维护，Web 与 Android 共用同一套业务代码。

## 固定标识

```text
应用名：王者多账号管理器
applicationId：com.foxmaybe.wangzheaccountmanager
Android Studio 工程名：WangZheAccountManager
```

发布后不要修改 applicationId，否则 Android 会把新包识别为另一款应用，无法覆盖安装或继承原应用数据。

## 本地构建

需要 Node.js 22、JDK 21、Android SDK 35 和 Gradle 8.11.1。

```bash
npm install
npm run sync:android
cd android
gradle assembleDebug
```

输出：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

打开 Android Studio：

```bash
npm run android:open
```

## Web 与 Android 资源路径

Web 构建继续使用 GitHub Pages 项目路径：

```text
/WangZheRongYao-1784465435/
```

Android 构建使用：

```bash
vite build --base ./
```

生成相对资源路径，避免 Capacitor WebView 加载 `/WangZheRongYao-1784465435/` 时出现空白页。

## Android 系统返回键

`src/platform/nativeAppShell.js` 使用 `@capacitor/app` 监听 `backButton`，处理顺序为：

1. 关闭当前最上层弹窗；
2. 取消详情页完整编辑状态；
3. 调用已注册的高优先级处理器；
4. WebView 有历史记录时执行 `window.history.back()`；
5. 根页面无历史时不强制退出，降低误触退出风险。

因此从区服详情按系统返回会回到原分组；弹窗打开时只关闭弹窗，不会直接离开页面。

## 回车与软键盘

普通单行输入框和下拉字段统一处理 Enter：

- 存在下一字段：聚焦并全选下一字段；
- 已是最后字段：提交当前表单；
- 多行皮肤文本框：保留正常换行；
- 动态表单出现后自动设置 `enterkeyhint=next/done`。

Android Manifest 对 Activity 设置：

```xml
android:windowSoftInputMode="adjustResize"
```

软键盘显示时 WebView 会缩小可用高度，而不是覆盖当前输入框。

## 防止组件展示不完整

Android 专用样式包含：

- `100dvh` App Shell；
- 刘海、状态栏和底部导航栏安全区域；
- 中间主内容独立滚动；
- 弹窗最大高度使用动态视口计算；
- 弹窗内容内部滚动；
- 输入字段设置顶部和底部 `scroll-margin`；
- 380px 以下表单切换单列；
- 680px 以下可用高度自动隐藏底部说明并压缩顶部；
- Android 15 `windowOptOutEdgeToEdgeEnforcement` 兼容配置。

## 数据存储

Capacitor WebView 的 localStorage 会保存在应用私有数据目录：

- 正常升级不会清除；
- 覆盖安装相同 applicationId 和相同签名时继续保留；
- 卸载应用或清除应用数据会删除；
- 更换签名后无法作为原应用更新安装。

因此必须永久保存本项目的固定签名 keystore。

## 工作流

### Verify Android App

推送到 `future/1784566876/AndroidApp` 时执行：

1. 安装 Node.js、JDK、Android SDK 和 Gradle；
2. 安装 npm 依赖；
3. 构建 Web 资源并执行 `cap sync android`；
4. 构建 Debug APK；
5. 上传 Debug APK 为 Actions Artifact。

### Android Signed Release

通过 `android-vX.0.Y` 标签或手动触发：

1. 校验版本；
2. 从 Repository Secrets 还原固定 keystore；
3. 构建并签名 APK 与 AAB；
4. 使用 `apksigner` 和 `jarsigner` 验证；
5. 生成 SHA-256 校验文件；
6. 上传 Artifact；
7. 创建 GitHub prerelease。
