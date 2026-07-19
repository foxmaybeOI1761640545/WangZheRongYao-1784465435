# 版本发布

## 1. 版本规则

建议使用语义化版本：

```text
MAJOR.MINOR.PATCH
```

- MAJOR：不兼容变更；
- MINOR：向后兼容的新功能；
- PATCH：向后兼容的问题修复。

示例：`v1.2.3`。

## 2. 发布前

```bash
npm ci
npm run build
```

确认：

- `main` 已包含本次全部修改；
- CI 通过；
- Pages 已验证；
- 版本说明已准备；
- 不包含密钥或本地环境文件。

## 3. 创建标签

```bash
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

匹配 `v*` 的标签会触发 `.github/workflows/release.yml`。

## 4. 自动发布内容

工作流会：

1. 检出标签代码；
2. 安装锁定依赖；
3. 构建 `dist`；
4. 把 `dist` 压缩为 ZIP；
5. 使用 GitHub CLI 创建 Release；
6. 自动生成变更说明。

## 5. 预发布

需要预发布时，可先使用：

```text
v1.1.0-beta.1
```

当前工作流仍会创建普通 Release。若项目需要自动标记 prerelease，可在 release 脚本中根据标签是否包含 `-` 增加 `--prerelease`。

## 6. 撤销发布

发现严重问题时：

1. 删除或标记有问题的 Release；
2. 修复代码；
3. 发布新的 PATCH 版本；
4. 不建议复用已经公开的版本号。
