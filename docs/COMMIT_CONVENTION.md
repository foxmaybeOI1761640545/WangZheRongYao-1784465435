# 提交规范

仓库使用中英文双语提交标题：

```text
<type>(<scope>): <中文摘要> | <English summary>
```

常用类型：

- `feat`：新功能；
- `fix`：问题修复；
- `ui`：界面或交互；
- `service`：构建、部署、工作流或服务配置；
- `refactor`：不改变外部行为的重构；
- `docs`：文档；
- `test`：测试；
- `chore`：维护任务。

示例：

```text
feat(form): 增加表单校验 | Add form validation
fix(pages): 修复子路径资源加载 | Fix subpath asset loading
service(ci): 增加构建检查 | Add build verification
docs(template): 补充新项目采用说明 | Document template adoption
```

提交正文应说明：

- 做了什么；
- 为什么这样做；
- 如何验证；
- 是否存在兼容或部署影响。

一个提交尽量只表达一个逻辑变更。不要把格式化、功能、依赖升级和部署调整混在没有说明的大提交中。
