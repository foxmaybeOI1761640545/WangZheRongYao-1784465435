# Android 应用内版本更新

本分支参考 WaterBreak `v1.0.16` 的实现，为王者多账号管理器增加基于 GitHub Releases 的应用内更新能力。

## 能力范围

- 启动后自动检查更新，非手动检查最短间隔为 12 小时；
- 支持 `beta` 与 `stable` 两个更新通道；
- 可以测试 GitHub API 与目标仓库连接；
- 使用 Android `DownloadManager` 在后台下载 APK，并展示进度；
- 下载完成后校验 SHA-256、applicationId、versionCode 和固定签名证书；
- 通过 `FileProvider` 打开 Android 系统安装器；
- Android 8 及以上未授权未知来源安装时，跳转到当前应用的授权页，返回后继续安装；
- 下载状态、更新通道和检查结果保存在 Android `SharedPreferences` 中。

## 更新数据来源

发布工作流在每个 Android Release 中额外上传 `update.json`。客户端不会根据文件名猜测版本，而是先读取 GitHub Release，再读取该清单。

Beta 通道读取：

```text
GET /repos/{owner}/{repo}/releases?per_page=20
```

Stable 通道读取：

```text
GET /repos/{owner}/{repo}/releases/latest
```

客户端只接受包含 `update.json` 的 Release。

## update.json

示例：

```json
{
  "schemaVersion": 1,
  "applicationId": "com.foxmaybe.wangzheaccountmanager",
  "versionName": "1.0.1",
  "versionCode": 1000001,
  "minimumSupportedVersionCode": 1000000,
  "mandatory": false,
  "channel": "beta",
  "publishedAt": "2026-07-21T04:00:00Z",
  "tag": "20260721-120000-future-1784566876-AndroidApp-v1.0.1",
  "branch": "future/1784566876/AndroidApp",
  "apkUrl": "https://github.com/.../WangZheAccountManager-future-1784566876-AndroidApp-v1.0.1.apk",
  "sha256": "...",
  "size": 12345678,
  "signingCertificateSha256": "...",
  "releaseNotes": ["更新内容"]
}
```

## 更新包校验

APK 下载后必须同时满足：

1. 清单提供有效的 64 位 SHA-256；
2. APK 文件 SHA-256 与清单一致；
3. APK 的 packageName 等于 `com.foxmaybe.wangzheaccountmanager`；
4. APK versionCode 高于当前安装版本；
5. APK versionCode 与清单完全一致；
6. APK 签名证书集合与当前已安装应用完全一致。

任何一项失败都会将下载状态标记为失败，不会启动安装器。

## 发布通道

当前分支 Push 自动发布 Beta prerelease，并生成下一个 `1.0.x` 版本。

手动发布时，可以在 Actions 的 **Android Signed Release** 中选择：

- `beta`：GitHub prerelease，客户端 Beta 通道可见；
- `stable`：正式 GitHub Release，并设为 Latest，客户端 Stable 通道可见；
- `mandatory`：在清单中标记为建议立即更新。

## Repository Secrets

继续使用现有固定签名：

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

更新仓库由工作流通过 `UPDATE_REPOSITORY=${{ github.repository }}` 写入 Android `BuildConfig`，不需要新增 Secret。

## 相关文件

```text
src/plugins/AppUpdate.js
src/composables/useAppUpdate.js
src/components/UpdateLauncher.vue
android/app/src/main/java/com/foxmaybe/wangzheaccountmanager/AppUpdatePlugin.kt
android/app/src/main/java/com/foxmaybe/wangzheaccountmanager/MainActivity.java
android/app/src/main/AndroidManifest.xml
android/app/build.gradle
.github/workflows/android-signed-release.yml
```
