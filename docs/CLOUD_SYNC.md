# Supabase 本地优先多设备同步

## 目标与边界

v1.0.15 在不改变账号树 `wangzhe-account-manager:v1` 和手动备份 Schema 3 的前提下，
增加固定 Workspace 的 Supabase 自动同步。页面始终先从 localStorage 启动；读写云端、
Realtime 连接、冲突重试和历史查询都在后台执行。断网、项目暂停或 WebSocket 失败不会
阻止账号、农场计算、行动队列、提醒和手动备份。

应用不提供登录、同步码或最终用户配置。项目 URL、`sb_publishable_` Key、Workspace
UUID、表名和 RPC 名是公开客户端配置，可以进入网页和 APK；它们不具备服务端管理权限。
仓库和应用严禁包含 Secret Key、service_role、数据库密码、JWT secret 或连接字符串。

## 固定对象

| 对象 | 值 |
| --- | --- |
| 状态表 | `public.app_sync_state` |
| 历史表 | `public.app_sync_history` |
| 保存 RPC | `public.save_wangzhe_sync_state` |
| 同步文档 Schema | `1` |
| 本地账号树 Key | `wangzhe-account-manager:v1` |

可复现 SQL 位于 `supabase/migrations/001_cloud_sync.sql`。客户端只直接读取表；所有写入
必须调用 RPC。RPC 使用 revision 行锁、2 MB 快照上限、固定 Workspace 校验和最近
50 个历史版本保留策略。RLS 只允许 anon 读取固定 Workspace，写权限只通过受限的
`SECURITY DEFINER` RPC 暴露。

## 数据模型

账号树被扁平化为 `nodes`，删除记录保存在 `tombstones`。同步专属的 `updatedAt`、
`updatedBy`、`position` 和删除元数据不写回 group/server 业务节点。

- group 同步 `name`、`createdAt`；
- server 使用与 `accountBackup.js` 一致的稳定字段白名单；
- `farmSchedule` 和完整的 `farmReminders` 会同步，包括 water/harvest 的稳定
  `notificationId`；
- 当前路由、弹窗、行动视图偏好、权限、pending/delivered 通知、平台错误、GitHub
  PAT 和备份配置不进入云端。

手动 JSON 仍是 Schema 3。同步文档 Schema 1 是独立协议，不是手动备份 Schema 4。
降级到 v1.0.14 后旧代码仍能读取原账号树；云同步 sidecar 会被旧版本忽略。

## 确定性合并

同 ID 节点按 `updatedAt` 较新者获胜；时间相同按 `updatedBy` 字符串稳定决胜。不同 ID
的并行修改全部保留。同一父节点按 `position`、`updatedAt`、`id` 排序，因此并行插入
仍得到一致顺序。

删除 group 时会为 group 和全部后代生成墓碑。墓碑和节点先比较时间，再比较设备 ID；
旧离线节点不能复活已删除数据，而真正较新的节点可以明确恢复。墓碑默认不自动清理。
父节点缺失、父节点不是 group 或形成 parent 环时，合法节点会移动到 root，不会静默
丢弃账号。

每台设备使用永久本地 Device ID。逻辑时间为：

```text
max(Date.now(), lastLogicalTimestamp + 1)
```

## 本地 sidecar 与 Recovery

| Key | 内容 |
| --- | --- |
| `wangzhe-cloud-sync:device-id:v1` | 随机 Device ID |
| `wangzhe-cloud-sync:state:v1` | revision、dirty、逻辑时间和工作文档 |
| `wangzhe-cloud-sync:recovery:v1` | 最近 3 份本地恢复点 |

dirty 状态和待上传文档会持久化，应用关闭后仍可继续。第一次接入云端、JSON 导入、
云端重新加载、历史恢复和本地恢复前都会保存 recovery。恢复点不包含 PAT、权限或系统
通知列表，可在高级选项中导出或恢复。

## 启动、离线与 Realtime

1. Store 立即读取原 localStorage 并显示 UI；
2. 提醒协调器按原流程初始化；
3. CloudSyncService 后台读取固定 Workspace；
4. 首次配对时云端同 ID 冲突优先，双方独有节点保留；
5. 必要时应用合并结果并重新校准提醒；
6. 建立 `UPDATE` Realtime 订阅。

本地修改在写入 localStorage 后通知同步服务，采用 1200 ms debounce 和 5000 ms
maxWait。失败按 2、5、15、30 秒退避；revision 冲突立即合并并最多重试 3 次。离线时
显示“离线修改已保存”，不会阻塞或频繁弹窗。

来自本设备的 Realtime 更新只推进 revision；其他设备更高 revision 会触发拉取合并。
应用恢复前台时先拉取合并，再按最终账号树校准 Android/网页提醒；进入后台时只做一次
best-effort flush，不新增 Android 后台 Service。

## 历史恢复与危险操作

备份中心可以立即同步、重新加载云端、读取最近 50 个历史版本、恢复历史、暂停本设备
自动同步和清除错误。重新加载和历史恢复必须明确确认，并先保存本地 recovery。历史
snapshot 不直接写表，而是以当前 revision 调用同一个 RPC，形成新的 current revision。
本地 JSON 与 GitHub 历史备份功能保持不变。

## 故障排查

- “配置无效”：检查 HTTPS URL、Publishable Key 非空和 Workspace UUID 格式；
- “同步失败，稍后重试”：本地修改已保存，可等待重试或点击“立即同步”；
- 项目暂停/HTTP 失败：本地功能完整可用，Supabase 恢复后自动补同步；
- revision 持续冲突：保留 dirty，不无限递归；稍后重试；
- Realtime 失败：仍可通过启动、前台恢复、立即同步和重试完成一致性；
- 云端数据异常：先导出当前 JSON，再使用 recovery 或云端历史恢复；
- 发布后问题：不可修改 v1.0.15 Release 或 Tag，只能从新修复分支 roll forward。

## 已知限制

- 固定匿名 Workspace 适用于受控个人应用，不提供多租户隔离；
- 同一节点使用最后节点修改优先，不做字段级合并；
- 设备时钟严重偏差仍可能影响跨设备先后顺序，逻辑时间只防止单设备回拨；
- 应用完全关闭时 JavaScript 不会持续后台同步；
- 免费项目暂停期间只保留本地修改；
- Android 通知权限、锁屏、Doze、重启和覆盖安装仍需真机验证。
