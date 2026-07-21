# Android 固定签名配置

## 重要原则

同一个 Android applicationId 的后续更新必须使用同一把私钥签名。丢失 keystore、别名或密码后，将无法生成可覆盖安装旧版本的更新包。

本仓库不提交 `.jks`、`.keystore`、密码或 Base64 私钥。固定签名材料应保存在离线备份和 GitHub Repository Secrets 中。

## 固定签名公开信息

```text
applicationId：com.foxmaybe.wangzheaccountmanager
keystore 文件名：wangzhe-account-manager-release.jks
key alias：wangzhe-account-manager
算法：RSA 4096 / SHA256withRSA
有效期：2026-07-20 至 2126-06-26
证书 SHA-1：3B:33:00:0A:BC:FA:36:09:EA:D1:00:7E:FB:A6:9B:21:C7:DC:71:B6
证书 SHA-256：0C:57:24:7C:58:6A:D0:E9:63:D2:46:6D:03:AE:96:35:1A:51:55:B1:E9:8A:E1:BE:52:EA:D8:59:A3:23:B5:80
keystore 文件 SHA-256：5d95111c39bdaa9c4f1a22d4eef11cef84ae09a781337069d9440717defca497
```

证书指纹和文件哈希不是秘密，可用于验证是否仍在使用同一套签名材料。

## Repository Secrets

在仓库的 **Settings → Secrets and variables → Actions → New repository secret** 中配置：

```text
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD
```

含义：

- `ANDROID_KEYSTORE_BASE64`：keystore 文件的单行 Base64；
- `ANDROID_KEYSTORE_PASSWORD`：keystore 存储密码；
- `ANDROID_KEY_ALIAS`：固定别名 `wangzhe-account-manager`；
- `ANDROID_KEY_PASSWORD`：私钥条目密码。

Linux/macOS 生成 Base64：

```bash
base64 -w 0 wangzhe-account-manager-release.jks
```

macOS 若不支持 `-w`：

```bash
base64 wangzhe-account-manager-release.jks | tr -d '\n'
```

PowerShell：

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('wangzhe-account-manager-release.jks'))
```

## 本地验证

```bash
keytool -list -v \
  -keystore wangzhe-account-manager-release.jks \
  -alias wangzhe-account-manager
```

文件哈希：

```bash
sha256sum wangzhe-account-manager-release.jks
```

## 发布

将目标提交打标签并推送：

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

标签中的版本必须符合 `X.0.Y`。工作流会生成：

```text
WangZheAccountManager-v1.0.0.apk
WangZheAccountManager-v1.0.0.aab
SHA256SUMS.txt
```

## 轮换限制

不要为日常版本重新生成签名。只有明确放弃旧安装包升级兼容性时，才可以更换 keystore。更换后应同时修改 applicationId，并作为新的 Android 应用发布。
