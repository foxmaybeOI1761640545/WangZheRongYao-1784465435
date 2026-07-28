# 农场工作流数据与备份兼容

## 当前数据版本

第三阶段导出的账号备份使用 `schemaVersion: 3`。账号节点保留第二阶段的可选
`farmSchedule`，并增加只记录用户意图和稳定通知 ID 的 `farmReminders`：

```json
{
  "farmSchedule": {
    "schemaVersion": 1,
    "cropType": "8",
    "calculatedAt": 1800000000000,
    "matureLeftMinutes": 420,
    "waterLeftMinutes": 80,
    "reportedMatureAt": 1800025200000,
    "elapsedSinceLastWaterMinutes": 80,
    "currentWaterReduceMinutes": 20,
    "matureAfterWaterMinutes": 400,
    "fastestLeftMinutes": 320,
    "savedMinutes": 100,
    "nextWaterAt": 1800004800000,
    "fastestMatureAt": 1800019200000
  },
  "farmReminders": {
    "schemaVersion": 1,
    "water": {
      "enabled": true,
      "notificationId": 627617530
    },
    "harvest": {
      "enabled": true,
      "notificationId": 644395149
    },
    "updatedAt": 1800000000000
  }
}
```

目标时间只从 `farmSchedule.nextWaterAt` 和
`farmSchedule.fastestMatureAt` 派生，不在 `farmReminders` 重复持久化。系统权限、
pending/delivered 状态和平台错误属于运行时信息，不进入账号树或备份。

所有时间戳均为 Unix 毫秒数。通知 ID 必须是 Android 可接受的正 32 位整数；
同一账号和类型尽量保持稳定，不同账号或类型发生冲突时在整棵树范围内确定性修复。

## 作物、计算与提醒联动

- 作物实际变化：同时清除旧 `farmSchedule` 和 `farmReminders`。
- 设置为相同作物：保留 schedule、提醒偏好和通知 ID。
- 保存新计算：已有提醒偏好和通知 ID 保留，目标时间随新 schedule 更新。
- 只保存计算：已有提醒自动更新时间；没有提醒时不会隐式新增。
- 批量撤销：恢复实际变化账号原先的作物、schedule 与 reminders。
- 删除账号或分组：先收集子树提醒 ID，再由协调器取消 pending/delivered 通知。

## 导入兼容

- 无外层 Schema 的旧根分组 JSON：按 Schema 1 处理。
- Schema 1：保留旧账号数据，补充 `farmSchedule: null` 和
  `farmReminders: null`。
- Schema 2：恢复合法 `farmSchedule`，补充 `farmReminders: null`。
- Schema 3：恢复合法 schedule 和 reminders；schedule 无效、作物不匹配或不存在
  时丢弃 reminders。
- Schema 3 中非法或重复通知 ID 会在整棵导入树上修复；未冲突的合法 ID 保持不变。
- 导入函数不调用原生通知插件。成功替换账号树后，由提醒协调器统一取消旧通知并根据
  新数据恢复未来提醒；导入失败不会改变现有提醒。
- PAT、GitHub Token、通知权限、精确提醒权限、pending/delivered 通知和平台错误
  均不会写入数据快照。

## 降级注意事项

- 第三阶段代码使用 Schema 3，并继续导入 Schema 1、2、3。
- v1.0.12 只理解到 Schema 2，不会使用 `farmReminders`。
- 降级到 v1.0.12 后重新导出，可能丢失提醒偏好和稳定通知 ID。
- 降级前必须保留一份 Schema 3 JSON 备份；重新升级后再导入。
- v1.0.11 还会丢失 `farmSchedule`，不要用旧版本覆盖唯一备份。

## 第四阶段派生行动视图

第四阶段不改变 Schema 3，也不修改 `farmSchedule` 或 `farmReminders` 的内部结构。
以下信息全部在运行时由现有账号数据和共享 `nowMs` 派生，不进入账号树或备份：

- 六种行动状态和优先级；
- 稳定排序结果与临时 `originalIndex`；
- 剩余时间、到期状态和固定阈值；
- 行动摘要；
- 收获确认框临时状态；
- `wangzhe-account-manager:farm-action-view:v1` UI 查看偏好。

备份创建使用稳定字段白名单，因此未知的行动/排序/权限运行时字段不会意外进入 JSON。
无外层 Schema、Schema 1、2、3 的导入规则不变，PAT 仍不会进入备份。

“已收获并重新种植”只执行一次 Store 原子更新：保留当前 `cropType` 和账号资料，清除
上一轮 `farmSchedule` 与 `farmReminders`。旧通知 ID 只作为调用平台取消接口的瞬时
返回值，不写入新的业务字段。

## Supabase 同步文档与降级

v1.0.15 继续使用原账号树 Key 和手动备份 Schema 3。云同步把稳定业务字段扁平化为
独立的同步文档 Schema 1，并把节点修改时间、设备 ID、position 和删除墓碑保存在
sidecar/云文档中，不污染 group/server。

`farmSchedule` 与完整 `farmReminders`（包括两个稳定 `notificationId`）参与同步。
Android/浏览器权限、pending/delivered、行动视图、路由、弹窗、GitHub PAT 和错误
重试状态不参与同步。远程账号树应用后重新执行提醒 ID 修复和提醒协调。

降级到 v1.0.14 后原账号树仍可直接读取，旧版本会忽略云同步 sidecar；此时的新本地
修改不会上传，重新升级后再通过节点合并补同步。降级或恢复前仍建议保留 Schema 3
JSON。详细规则见 [`CLOUD_SYNC.md`](CLOUD_SYNC.md)。
