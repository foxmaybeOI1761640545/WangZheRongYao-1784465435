# Immutable Android Release workflow

仓库启用 GitHub Release Immutability 后，Android 固定签名发布采用以下顺序：

1. 构建并验证固定签名 APK 与 AAB。
2. 生成 `update.json` 与 `SHA256SUMS.txt`。
3. 创建 Git Tag。
4. 通过 GitHub Releases API 创建 Draft Release。
5. 使用 Draft Release ID 上传 APK、AAB、`update.json` 和 `SHA256SUMS.txt`。
6. 在 Draft 状态下核对资产名称、数量、上传状态、大小和 SHA-256 摘要。
7. 资产全部通过验证后发布 Draft Release。
8. 发布后确认 Release 已变为不可变状态。

失败时仅清理未发布的 Draft Release 和孤立 Tag，不修改已经发布的不可变 Release。
