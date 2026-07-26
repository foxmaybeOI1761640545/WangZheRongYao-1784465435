# 农场工作流数据与备份兼容

## 当前数据版本

第二阶段导出的账号备份使用 `schemaVersion: 2`。账号节点新增可选的 `farmSchedule`：

```json
{
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
}
```

`farmSchedule` 内部的 `schemaVersion` 用于计算结果结构校验，与外层备份 Schema 分开演进。所有时间戳均为 Unix 毫秒数，所有分钟字段均为有限非负数。

## 作物变化规则

当账号作物实际变化时，Store 会同时清除旧 `farmSchedule`。设置为相同作物不会清除。该规则统一覆盖主页循环、详情编辑、完整编辑和批量修改。

批量撤销只恢复最近一次批量操作中实际发生变化的账号，并同时恢复原 `cropType` 与原 `farmSchedule`。

## 导入兼容

- Schema 1：继续支持；导入时保留分组、账号和 `cropType`，并为账号补充 `farmSchedule: null`。
- Schema 2：恢复合法 `farmSchedule`；结构不完整、数值非法、未记录作物或 schedule 作物与账号不一致时丢弃该 schedule。
- 未带外层 Schema 的旧根分组 JSON 按 Schema 1 处理。
- PAT 与 GitHub 备份配置不会写入账号数据快照。

## 降级注意事项

- v1.0.12 及后续第二阶段版本可以导入 Schema 1 和 Schema 2。
- v1.0.11 只理解旧账号字段，不会使用 `farmSchedule`。
- 使用 v1.0.11 打开第二阶段数据并重新导出时，可能丢失农场时间字段。
- 降级到 v1.0.11 前，应先保留一份 Schema 2 JSON 备份；重新升级后再导入该备份。
