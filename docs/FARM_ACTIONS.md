# 农场行动优先队列与新一轮种植

> **任何开发者或 AI 在修改本项目前，必须先完整阅读本文件。**

## 产品目标

第四阶段让当前分组页面直接回答“现在应该先处理哪个账号”。行动模式读取当前分组
递归子树内的账号，按唯一主状态稳定排序；原顺序模式继续保留 v1.0.13 的子分组优先、
直属账号和手动顺序行为。

本阶段不自动登录、打开游戏、浇水或收获。所有状态均由现有 `cropType`、
`farmSchedule` 和共享 `nowMs` 派生。

## 六种状态与固定阈值

| 优先级 | 状态键 | 文案 | 判定 |
| ---: | --- | --- | --- |
| 0 | `harvest-due` | 可以收获 | `fastestMatureAt <= nowMs` |
| 1 | `water` | 需要/即将浇水 | 尚未成熟，且 `nextWaterAt <= nowMs + 30 分钟` |
| 2 | `harvest-soon` | 即将成熟 | 不属于前两项，且 `fastestMatureAt <= nowMs + 2 小时` |
| 3 | `growing` | 生长中 | 作物和 schedule 合法，但不满足前三项 |
| 4 | `unscheduled` | 未计算时间 | 作物合法，schedule 缺失或无效 |
| 5 | `unrecorded` | 未记录作物 | `cropType === ''` 或非法 |

窗口固定为 30 分钟和 2 小时，第一版不提供设置页，也不持久化阈值。重叠时严格采用：
收获 → 浇水 → 即将成熟 → 生长。未记录作物即使残留异常 schedule 也只能是未记录。

## 稳定排序与递归范围

`src/domain/farmActions.js` 是分类、排序、摘要、状态文案、无障碍名称和主要操作的唯一
领域来源。`store.getServersInGroup(groupId)` 提供递归范围和分组路径；每条记录只增加
临时 `originalIndex` 与 `farmAction` 派生结果。

排序只比较状态优先级；相同状态比较 `originalIndex`。实现创建新数组，不原地修改
输入、`children` 或真实账号顺序，不按账号名称、区服数字和剩余分钟二次排序。

根分组展示全部子树账号；子分组只展示该子树。卡片始终以 `server.id` 作为 Vue key。
共享 `useFarmClock.js` 每 30 秒刷新后会重新分类、排序、汇总和更新倒计时，不创建第二
个全局定时器或卡片定时器。

## 行动模式、原顺序模式与 UI 偏好

- 默认模式：`action`，行动队列位于子分组导航之前。
- 原顺序：`original`，子分组优先，只展示当前分组直属账号，保留删除和原有卡片操作。
- 偏好键：`wangzhe-account-manager:farm-action-view:v1`。
- 非法值回退到 `action`。

该偏好只属于当前设备 UI，不进入账号树、Schema 3 JSON 或 GitHub 数据备份。

## 摘要、颜色与无障碍

同一个 computed 在一次遍历中完成分类和六种状态计数，再从分类结果创建稳定排序。
摘要允许在 360px 下换行。

每张卡片同时提供文字、符号、`aria-label` 和 CSS 状态类。颜色只用于左侧细条与小型
徽章辅助：

- `farm-action-harvest-due`：玫红；
- `farm-action-water`：橙色；
- `farm-action-harvest-soon`：琥珀色；
- `farm-action-growing`：蓝绿；
- `farm-action-unscheduled`：紫灰；
- `farm-action-unrecorded`：灰色。

主要操作和作物按钮的触控区域至少为 44×44 CSS px。

## 各状态主要操作

- 可以收获：`已收获并重新种植`，先进入确认框。
- 浇水：`浇水后重算`，只打开现有计算器，不提前修改 schedule 或提醒。
- 即将成熟、生长中：`查看时间`，打开现有计算/提醒面板。
- 未计时：`计算时间`。
- 未记录：`设置作物`，只聚焦当前卡片作物按钮，不默认选择 8 小时或直接打开计算器。

## 已收获并重新种植

该操作表示用户已在游戏中完成收获，并继续种植同一种作物；不表示应用自动操作游戏或
推测新一轮时间。

路径：

1. 用户点击“已收获并重新种植”；
2. 确认框显示区服、账号 ID、当前作物和将清理的数据；
3. `startNextFarmCycle(serverId)` 原子保留 `cropType` 和其他账号资料；
4. 将 `farmSchedule`、`farmReminders` 设为 `null`；
5. 返回上一轮 schedule、提醒和两个 notificationId；
6. App 取消 Android pending、移除 delivered，并再次同步；
7. 网页监控器只忘记该账号旧 water/harvest 去重记录；
8. 关闭确认框并打开同账号的新一轮计算器；
9. 用户重新输入时间，保存后按需重新开启提醒。

Store 不调用插件、不操作 DOM、不打开计算器，也不新增 `lastHarvestedAt`、次数或历史
字段。系统通知取消失败时本地重置不回滚，页面显示轻量错误，恢复前台时协调器会再次
校准。

确认框默认焦点位于取消按钮；Esc 与 Android 返回键通过现有统一 overlay/返回桥接优先
关闭确认框。背景点击不会执行确认，提交期间按钮禁用以防重复操作。

## 数据和 Schema

外层备份继续使用 Schema 3，账号业务字段仍为现有 `cropType`、`farmSchedule` 和
`farmReminders`。行动状态、优先级、排序结果、`nowMs`、阈值、视图偏好和确认框状态
均不持久化。备份层使用稳定字段白名单，继续导入无外层 Schema、Schema 1、2、3，并
排除 PAT 和运行时权限状态。

## 自动化、Android 回归与响应式

专项测试覆盖六种分类、边界、重叠优先级、稳定排序、递归范围、输入不可变、摘要、
共享时间变化、Store 原子重置、localStorage 即时保存、Fake Adapter 通知清理、网页
去重、备份排除和视图偏好。

Android 原生范围保持不变：不修改 Manifest、权限、插件、频道、MainActivity、Gradle
或签名工作流。方案 B 继续使用 Node 22、Temurin JDK 21、Gradle 8.11.1 与
`gradle assembleDebug`。

响应式必须复核 360、390、430、1366px 和 360×500：切换按钮/摘要换行、长 ID、路径、
44px 触控、无横向滚动、确认框可操作、计算器软键盘布局和原顺序模式。

## 发布状态

- Phase4 已随 v1.0.14 Android Beta Pre-release 发布；
- Release Tag：`20260727-153511-future-1784566876-AndroidApp-v1.0.14`；
- Release Commit：`064485a004545955f9227114995ac7056f8d21d2`；
- Release 已发布且不可变，`draft=false`、`prerelease=true`、`immutable=true`；
- Schema 仍为 3，本阶段没有新增持久化业务字段；
- Phase5 尚未启动；
- 真实 Android 通知清理和物理返回键仍未实测。

## 已知风险与下一阶段

第三阶段真实 Android 权限、前后台/锁屏/Doze、强制结束、声音振动、通知点击、设备
重启恢复和覆盖安装仍未实测。Doze、厂商省电和 Android 15 Private Space 可能延迟通知；
静态测试与 Debug 构建不能替代真机行为验证。

第五阶段战令 40 级提醒尚未开始。开始下一阶段前必须完整阅读 `AGENTS.md`、路线文档、
本文件、数据/提醒文档、全部 Android 文档、不可变发布说明以及相关源码和测试。
