# 农场提醒设计与验证

> **修改提醒领域模型、Store、平台适配器、生命周期或 Android 配置前，必须先完整阅读本文件；修改后同步更新测试结果、设备验证和已知限制。**

## 能力边界

第三阶段提供：

- 页面打开时每 30 秒校准一次的浇水、理论最快成熟倒计时；
- 用户主动授权后的浏览器通知；
- Android 本地通知，区分 `exact`、`inexact`、`denied` 和
  `unsupported`；
- 权限不足时的一键复制和手动复制回退；
- 启动、恢复前台、重新计算、作物修改、批量撤销和删除后的统一校准。

本项目不实现全屏闹钟或自动拉起应用。第四阶段只消费既有提醒数据，并增加收获后进入
同作物新一轮时的定向清理；不重构第三阶段通知架构。网页通知只在页面仍保持打开时
可靠；关闭浏览器标签页后不承诺后台通知。

## 数据和通知 ID

`farmReminders` 只保存 `waterEnabled`、`harvestEnabled` 和两种稳定通知 ID。
目标时间来自 `farmSchedule`。ID 由账号 ID 和提醒类型确定性生成，限制在正 32 位整数
范围；导入和水合会遍历整棵树，保留合法未冲突 ID，并修复重复或非法值。

通知 `extra` 只包含 schema、来源、账号 ID、提醒类型和目标时间。标题和正文只展示
区服、账号 ID 以及浇水/收获动作，不含 PAT、仓库配置、皮肤、战令详情、备份路径或
签名信息。

## Android 插件与权限

- 插件：`@capacitor/local-notifications` `7.0.7`。
- 普通通知权限只在用户点击“保存并设置提醒”或已有日程中的应用按钮后请求；首次启动
  不弹权限。
- Manifest 只由应用显式声明 `SCHEDULE_EXACT_ALARM`。Android 12+ 的精确提醒属于
  用户可撤销的特殊访问，UI 先解释再打开系统设置。
- 不声明 `USE_EXACT_ALARM`：本应用不是闹钟或日历类核心用途，避免不符合 Google Play
  的受限权限政策。
- Android 13+ 的 `POST_NOTIFICATIONS`、开机恢复 receiver 和定时通知 receiver 由
  官方插件 Manifest 合并提供，不在应用 Manifest 无理由重复声明，也不手工注册插件。
- 未取得精确权限时插件使用普通/允许空闲模式的非精确安排；UI 明确显示
  `inexact`，不冒充精确提醒。
- 通知频道固定为 `farm-water-reminders-v1` 与
  `farm-harvest-reminders-v1`，使用 private 锁屏可见性、声音和振动。

## 校准与生命周期

协调器从 Store 构建期望计划，再读取系统 pending 通知：

1. 取消数据树中已不存在、已禁用或目标时间已变化的通知；
2. 跳过已经到期的目标，不补发旧系统通知；
3. 创建缺失的未来提醒；
4. 单个取消或创建失败只记录该项，继续处理其他提醒；
5. 重复校准不重复创建相同通知；
6. 删除账号或分组时同时清理 pending 和 delivered 通知。

应用启动时创建频道并校准，不请求权限；恢复前台时重新检查普通和精确权限并校准。
用户关闭精确提醒访问后，系统可能清除原精确闹钟，应用会提示并按当前能力重新安排。
官方插件通过开机 receiver 恢复已保存的未来通知。

v1.0.15 从 Supabase 应用远程账号树后，会先在 Store 水合层修复全树稳定通知 ID，再
调用同一个协调器校准每台设备自己的 pending/delivered 空间。权限和系统通知列表从不
进入云端；另一台设备开启提醒只同步用户意图和 ID，本设备仍按自己的权限能力安排。

第四阶段确认“已收获并重新种植”后，Store 先清除上一轮 schedule/reminders 并返回旧
notificationId；App 再调用协调器同时取消 pending 和移除 delivered，随后执行幂等
校准。单项取消失败不会回滚本地新一轮状态，恢复前台时仍会再次校准。

## 网页通知

共享时钟只维护一个 30 秒计时器，并在 `visibilitychange` 后立即刷新。网页监控器在启动
时先记录已过时间，避免刷新页面补发旧通知；只有未来时间跨越到期点时通知一次。
通知点击会关闭临时面板并定位账号；账号已删除时退回根分组。

网页监控器提供 `forgetServer(serverId)`，只删除目标账号旧 water/harvest 的已触发
记录。其他账号不受影响；同账号保存新目标后可再次正常触发。

浏览器不支持通知、权限被拒绝或剪贴板失败时，倒计时和明确时间仍可见，并提供可手动
选择的复制文本。

## Manifest 与构建检查

应用 Manifest 必须包含 `SCHEDULE_EXACT_ALARM`，且不得包含
`USE_EXACT_ALARM`。官方插件 Manifest 必须提供：

- `POST_NOTIFICATIONS`、`RECEIVE_BOOT_COMPLETED` 与 `WAKE_LOCK`；
- `TimedNotificationPublisher`；
- `NotificationDismissReceiver`；
- 接收启动、替换包和时区变化的 `LocalNotificationRestoreReceiver`。

静态自动化测试检查上述合并输入；GitHub 的方案 B Debug 构建（Gradle 8.11.1、
JDK 21）是实际 Manifest 合并和插件编译的权威验证。

## 系统限制

- Doze 下 `allowWhileIdle` 的触发频率受 Android 限制，提醒仍可能延迟。
- 厂商省电、强制停止应用或关闭通知频道可能阻止通知。
- Android 15 Private Space 被锁定时，通知可能延迟到解锁后显示；应用无法可靠检测
  自己是否位于 Private Space，这不是应用错误。
- 设备重启恢复依赖官方插件 receiver；没有 Android 设备时必须把重启、锁屏、Doze、
  声音振动和通知点击标为未实测，不能用响应式浏览器模拟代替。

## 当前验证清单

- [x] 领域模型、ID、计划生成、冲突修复自动化测试
- [x] Schema 1/2/3 迁移和敏感运行时字段过滤测试
- [x] Store 作物、计算、批量撤销、删除联动测试
- [x] Fake Adapter 协调器 exact/inexact/denied、更新、过期、容错和幂等测试
- [x] 固定时钟网页到期和去重测试
- [x] 新一轮定向取消 pending、移除 delivered 和网页去重清理测试
- [x] Android Manifest 与插件 Manifest 静态输入测试
- [ ] Android 13/14 模拟器或真机权限流程
- [ ] 前台、后台、锁屏、Doze、强制结束后的通知触发
- [ ] 点击通知定位账号
- [ ] 设备重启后的提醒恢复
- [ ] v1.0.12 覆盖安装后的数据保留
