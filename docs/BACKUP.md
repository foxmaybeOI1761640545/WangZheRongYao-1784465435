# 数据导出与 GitHub 备份

## 1. 备份格式

导出与 GitHub 备份使用相同的 JSON 快照格式：

```json
{
  "schemaVersion": 1,
  "app": "wangzhe-account-manager",
  "exportedAt": "2026-07-20T00:00:00.000Z",
  "stats": {
    "groups": 0,
    "servers": 0
  },
  "data": {
    "id": "root",
    "type": "group",
    "children": []
  }
}
```

快照包含完整分组树和区服资料，不包含 PAT，也不包含 GitHub 备份配置。

## 2. 本地导出与恢复

“导出 JSON”会下载：

```text
wangzhe-account-data-<UTC时间>.json
```

“从 JSON 恢复”会校验文件类型、版本和根分组结构；确认后覆盖当前浏览器数据并刷新页面。

## 3. GitHub 默认配置

除 PAT 外，以下配置已作为默认值并保存在当前浏览器：

```text
GitHub 用户名：foxmaybeOI1761640545
仓库名：WangZheRongYao-1784465435
分支名：backup/1784534225/AccountData
根目录：AccountData01
```

默认备份分支的当前文件树只包含 `AccountData01/`。每次备份会新增：

```text
AccountData01/account-data-<UTC时间>.json
```

采用时间戳文件而不是覆盖单一文件，可以保留多版本备份。

## 4. PAT 权限与安全

推荐使用 Fine-grained personal access token，并限制为：

- 仅允许目标仓库；
- Repository permissions → Contents：Read and write；
- 不授予无关权限；
- 设置合理过期时间。

PAT：

- 不写入 localStorage；
- 不进入导出 JSON；
- 不写入备份文件或提交信息；
- 默认在备份成功后清空；
- 关闭弹窗后随组件销毁而从页面内存释放。

## 5. GitHub API 流程

网页端调用 GitHub Contents API：

```text
PUT /repos/{owner}/{repo}/contents/{rootDirectory/时间戳文件.json}
```

请求包含 Base64 编码的 JSON 快照、目标分支和不含 PAT 的提交说明。目标分支必须已经存在。

## 6. 限制

- 当前为手动备份，不会后台定时运行；
- 浏览器必须能访问 GitHub API；
- PAT 权限不足、失效或目标分支不存在时会返回明确错误；
- 公开仓库中的备份文件也会公开；
- 不应记录密码、登录 Cookie、访问令牌或支付信息。
