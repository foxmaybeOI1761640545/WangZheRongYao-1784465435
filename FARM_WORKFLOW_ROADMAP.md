# 农场工作流开发路线

> **任何开发者或 AI 在修改本项目前，必须先完整阅读本文件，检查当前阶段、已完成任务、未完成任务和已知问题；修改完成后必须同步更新本文件。**

## 1. 项目真实使用场景

本项目服务于需要日常处理多个《王者荣耀》账号的用户。高频动作不是维护完整资料，而是依次确认每个账号当前种植的作物、计算下一次农场操作时间，并在合适的时间进入对应账号处理。

历史文本记录使用以下短代码：

| 数据值 | 页面代码 | 含义 |
| --- | --- | --- |
| `''` | `---` | 未记录或当前没有种植 |
| `'8'` | `8` | 8 小时作物 |
| `'16'` | `1` | 16 小时作物 |
| `'32'` | `3` | 32 小时作物 |

账号等级、战令等级、农场等级、系统、平台和皮肤仍然保留，但它们是详情页中的低频资料。

## 2. 产品方向调整原因

旧主页只能打开账号详情，再经过作物参数弹窗和保存流程修改作物。十几个账号每天重复该流程会产生大量无价值点击。因此产品方向从“资料管理器”逐步调整为“农场日常操作台”，目标路径是：

1. 点一下修改作物；
2. 点一下计算时间；
3. 点一下设置提醒；
4. 到时间后进入游戏处理对应账号。

第一、第二阶段均已发布；当前进入第三阶段，在稳定的 `farmSchedule` 与 Schema 2 基础上实现网页倒计时、浏览器通知和 Android 本地农场提醒，不提前实现第四阶段自动排序。

## 3. 唯一开发基线

- 仓库：`foxmaybeOI1761640545/WangZheRongYao-1784465435`
- Release Tag：`20260726-160013-future-1784566876-AndroidApp-v1.0.12`
- 基线提交：`402205201939727d4c1dc6c5e21eb32772b205eb`
- Release：v1.0.12 Android Beta Pre-release，已发布且不可变；
- 第二阶段的六个提交已通过纯 fast-forward 进入 `future/1784566876/AndroidApp`，没有产生 Merge Commit；
- 第三阶段基线分支来源：直接从上述 Tag 创建，不修改 Tag、`main` 或 Android 发布分支。

## 4. 当前开发分支

- 分支：`future/1785054684/FarmWorkflowPhase3`
- 阶段：第三阶段——网页倒计时与 Android 本地农场提醒
- 第一阶段状态：已通过 PR #8 进入 `future/1784566876/AndroidApp`，并发布 v1.0.11；
- 第二阶段状态：PR #9 的六个提交已纯 fast-forward 到 AndroidApp，没有 Merge Commit；
- 发布状态：v1.0.12 Beta Pre-release 已成功发布且不可变；第三阶段仅创建 Draft PR，不发布 v1.0.13。

## 5. 当前技术栈

- Vue `3.5.39`，Composition API 与单文件组件；
- Vite `8.1.0`；
- Capacitor Core/Android/CLI `7.6.7`；
- `@capacitor/app` `7.1.2`；
- `@capacitor/local-notifications` `7.0.7`；
- Android Java/Kotlin 混合壳层；
- 浏览器 `localStorage` 本地持久化；
- GitHub Contents API 数据备份；
- Node 内置 Test Runner；
- GitHub Actions 固定签名与不可变 Release 流程。

## 6. 关键目录与文件职责

| 路径 | 职责 |
| --- | --- |
| `src/domain/cropTypes.js` | 作物合法值、代码、标签、规范化和循环纯函数 |
| `src/domain/farmCalculator.js` | 8/16/32 小时参数、成熟公式、schedule 校验、时间与时长格式化 |
| `src/domain/accountBackup.js` | Schema 1/2/3 迁移、Schema 3 导出及非法 schedule/reminders 清理 |
| `src/domain/farmReminders.js` | 提醒 Schema、稳定通知 ID、冲突修复、计划与倒计时纯函数 |
| `src/composables/useAccountStore.js` | 数据水合、树操作、批量/撤销、schedule 与提醒偏好原子保存 |
| `src/services/farmReminderCoordinator.js` | 期望计划与系统通知的幂等校准 |
| `src/platform/farmReminderAdapter.js` | Capacitor 通知、权限、频道和浏览器通知的唯一平台层 |
| `src/composables/useFarmClock.js` | 页面共享 30 秒时钟和可见性恢复刷新 |
| `src/components/GroupBrowser.vue` | 普通主页、作物循环、农场时间入口、倒计时与紧凑结果展示 |
| `src/components/FarmReminderSettings.vue` | 提醒开关、能力状态、复制和精确设置入口 |
| `src/components/QuickCropRecorder.vue` | 单账号快速记录、批量选择、目标确认和一次撤销入口 |
| `src/components/FarmTimeCalculator.vue` | 单账号倒计时输入、结果预览和明确保存 |
| `src/components/ServerDetail.vue` | 详情展示、单项编辑与完整资料编辑 |
| `src/components/BackupCenter.vue` | Schema 1/2 导入、Schema 2 导出与 GitHub 备份 |
| `src/App.vue` | 路由、弹窗、快速记录模式生命周期、Esc 和 Android 返回键优先级 |
| `src/platform/nativeAppShell.js` | Capacitor 原生返回键桥接与表单 Enter 导航 |
| `src/quick-crop-recorder.css` | 普通主页作物按钮覆盖及快速记录响应式样式 |
| `tests/cropTypes.test.js` | 作物模型、旧数据、即时持久化、原子更新和递归顺序测试 |
| `tests/farmCalculator.test.js` | 公式、边界、秒级取整和格式化测试 |
| `tests/accountStoreFarm.test.js` | 批量、撤销、作物变化清理和 schedule 原子方法测试 |
| `tests/farmReminders.test.js` | 提醒 ID、计划、隐私和倒计时测试 |
| `tests/farmReminderCoordinator.test.js` | Fake Adapter 校准、权限、容错和幂等测试 |
| `tests/reminderMigration.test.js` | Schema 1/2/3 提醒迁移测试 |
| `docs/FARM_WORKFLOW_DATA.md` | Schema 3 数据结构、备份兼容和降级说明 |
| `docs/FARM_REMINDERS.md` | 提醒架构、权限、Manifest、限制和设备验证清单 |
| `docs/ANDROID*.md` | Android 构建、更新与签名说明 |
| `docs/IMMUTABLE_RELEASE.md` | Release Immutability 流程 |

## 7. 当前账号数据结构

v1.0.11 基线账号保持 Schema Version 1；第二阶段增加可选 `farmSchedule`；第三阶段
增加可选 `farmReminders`，备份升级为 Schema Version 3：

```js
{
  id: 'server-...',
  type: 'server',
  parentId: 'group-...',
  serverName: '131区',
  system: 'android',
  platform: 'qq',
  accountId: '...',
  accountLevel: 0,
  battlePassLevel: 0,
  farmLevel: 0,
  cropType: '',
  farmSchedule: null,
  farmReminders: null,
  epicSkins: '',
  createdAt: 0,
}
```

合法 `farmSchedule` 使用内部 `schemaVersion: 1`。合法 `farmReminders` 也使用独立的
`schemaVersion: 1`，只保存两个开关和两个稳定正 32 位通知 ID；目标时间继续从 schedule
派生。分组节点继续使用 `children` 保存子分组和账号。

## 8. 作物值、代码与标签映射

唯一来源是 `src/domain/cropTypes.js`：

```js
CROP_TYPES = ['', '8', '16', '32']
```

固定循环：

```text
'' → '8' → '16' → '32' → ''
--- → 8 → 1 → 3 → ---
```

纯函数：

- `normaliseCropType(value)`：非法值和缺失值规范化为 `''`；
- `cropTypeToCode(value)`：转换为主页短代码；
- `cropTypeToLabel(value)`：转换为“未记录”或完整小时标签；
- `nextCropType(value)`：返回固定循环中的下一项。

禁止在组件中重新定义映射或循环。

## 9. 第一阶段设计决策

1. 缺失作物不再隐式设为 8 小时，避免把“不知道”误写成已种植。
2. Store 使用 `flush: 'sync'` 深度监听，保证作物按钮点击后立即写入 `localStorage`。
3. `setServerCropType` 和 `cycleServerCropType` 只修改目标账号的 `cropType`。
4. 主页卡片主体、作物按钮和删除按钮是三个并列按钮，避免嵌套按钮和点击冲突。
5. 原生 `<button>` 自动支持 Enter 与 Space；作物按钮提供包含当前值和下一值的完整无障碍名称。
6. 普通主页保留双列卡片；快速记录使用单列紧凑行。
7. 快速记录列表由 Store 递归生成：当前分组直属账号优先，随后按子分组顺序深度遍历，并保持每个分组中的账号顺序。
8. 快速记录不做批量保存；每次点击即时保存。
9. Android 返回键复用现有 `registerNativeBackHandler`，没有新增第二套原生监听。
10. 网页 Esc 在没有更上层弹窗时退出快速记录。
11. 退出后恢复原列表滚动位置；若布局最大滚动范围发生轻微变化，浏览器会自动钳制到最接近位置。
12. `BackupCenter.vue` 的 Schema Version 1 和 GitHub 默认备份配置保持不变。

## 10. 第一阶段已完成

- [x] 集中定义作物合法值、代码、标签和循环。
- [x] 支持 `''` 未记录状态。
- [x] 旧 `8/16/32` 数据原样水合。
- [x] 缺失或非法值水合为未记录。
- [x] 新账号默认未记录。
- [x] 新增原子化 `setServerCropType` 和 `cycleServerCropType`。
- [x] 新增递归 `getServersInGroup`。
- [x] 主页作物按钮直接循环并即时持久化。
- [x] 卡片主体、作物和删除点击互相隔离。
- [x] 未记录使用中性样式，其他代码沿用黄色样式。
- [x] 作物触控目标至少 44×44 CSS px。
- [x] 详情单项编辑和完整编辑支持未记录。
- [x] 新增快速记录模式与已记录数量。
- [x] 根分组递归显示全部账号，子分组只显示自身子树。
- [x] 快速记录不显示删除入口且行本身不导航。
- [x] 网页 Esc 与 Android 返回处理器优先退出快速记录。
- [x] 创建自动化数据兼容测试。
- [x] 修复基线 `package-lock.json` 与 `package.json` 不同步问题，使最终 `npm ci` 通过。
- [x] 创建本路线文档与 `AGENTS.md`。
- [x] 明确 Android 构建采用方案 B：CI 安装固定 Gradle，不提交 Gradle Wrapper。
- [x] 方案 B Android Debug PR 检查已成功并产出 `app-debug.apk`。
- [x] 通过 PR #8 合并到 `future/1784566876/AndroidApp`。
- [x] 发布不可变的 v1.0.11 Android Beta Pre-release。

## 11. 尚未完成

### 第二阶段

- [x] 增加递归范围内的批量选择、全选、清空和固定作物目标；
- [x] 增加批量确认与最近一次批量操作撤销；
- [x] 抽取 FarmCalculator 纯计算逻辑；
- [x] 从账号作物自动选择 8/16/32 小时参数；
- [x] 输入当前成熟剩余和当前水分剩余；
- [x] 仅在明确点击“保存结果”后写入计算结果；
- [x] 保存计算时间、当前预计成熟、理论最快成熟和下一次浇水时间；
- [x] 在账号卡片展示计算结果；
- [x] 作物实际变化时集中清理旧 schedule，相同作物保留；
- [x] 备份升级为 Schema 2，并继续导入 Schema 1；
- [x] 完成计算、批量、撤销和迁移自动化测试；
- [x] Draft PR 的方案 B Android Debug CI 成功并产出 `app-debug.apk`。

### 第三阶段

- [x] 网页倒计时、网页通知和复制降级；
- [x] Android Local Notifications、频道和 exact/inexact/denied 能力；
- [x] 启动/前台恢复、重新计算、作物修改、批量撤销和删除校准；
- [x] Schema 3 与稳定通知 ID 冲突修复；
- [x] 自动化测试、数据说明和提醒架构文档；
- [ ] Android 真机/模拟器的权限、锁屏、Doze、点击和设备重启实测；
- [x] Draft PR 的方案 B Debug CI 验证并产出 APK。

### 第四阶段

- [ ] 按收获、浇水、成熟、生长、未计时、未记录排序；
- [ ] 状态颜色和剩余时间；
- [ ] “已收获并重新种植”操作。

### 第五阶段

- [ ] 战令 40 级目标提醒；
- [ ] 只在接近或达到目标时展示轻量提示。

## 12. 第一阶段验收结果

### 数据

- [x] 旧 `localStorage` 树正常加载；
- [x] `8/16/32` 不被错误转换；
- [x] 未记录可以保存并通过 JSON 持久化；
- [x] 新账号默认未记录；
- [x] Schema Version 1 导入路径未改变；
- [x] 导出数据可包含空字符串；
- [x] 未向数据结构加入第二阶段字段。

### 普通主页

- [x] 卡片主体进入详情；
- [x] 作物按钮不进入详情；
- [x] 作物按 `---/8/1/3` 循环；
- [x] 每次点击即时保存；
- [x] 删除确认不改变作物；
- [x] 点击作物不改变路由或滚动位置；
- [x] 按钮具备当前与下一作物的无障碍描述。

### 快速记录

- [x] 根分组递归包含全部子分组账号；
- [x] 子分组范围由递归起点限制；
- [x] 保持分组和账号顺序；
- [x] 每行只显示区服、账号 ID、可选路径和作物按钮；
- [x] 不显示删除按钮；
- [x] 点击行不导航；
- [x] 显示已记录数；
- [x] “完成”和 Esc 可以退出；
- [x] Android 返回处理器以优先级 `100` 退出；
- [x] 退出后回到原列表合理位置。

### 回归

- [x] 详情单项与完整编辑继续构建通过；
- [x] 分组、账号、备份、更新入口代码未删除；
- [x] 表单 Enter 导航代码未修改；
- [x] 安全区域、固定顶部和底部结构保留；
- [x] 360/390/430/1366 CSS px 自动化检查无横向溢出；
- [x] 长账号 ID 下作物按钮仍在视口内。

## 13. 已执行命令和结果

### Android 构建方案 B

本项目有意不提交 `android/gradlew`、`android/gradlew.bat` 或 `android/gradle/wrapper/`。缺少 Gradle Wrapper 不是文件缺失或待修复问题。Android 构建统一由 GitHub Actions 安装并固定以下环境：

- Node.js 22；
- Temurin JDK 21；
- Gradle 8.11.1；
- `android-actions/setup-android@v3` 提供 Android SDK。

Debug 构建在 `android` 目录执行 `gradle assembleDebug`；正式签名构建执行 `gradle assembleRelease bundleRelease`。不得改用 `./gradlew`，也不得向仓库补交 Wrapper。Android 构建以 GitHub Actions 结果为权威结果。

### 修改前基线

| 命令 | 结果 |
| --- | --- |
| `npm ci` | 失败：基线锁文件缺少 Capacitor 等依赖，`package.json` 与锁文件不同步 |
| `npm install --package-lock=false` | 通过，仅用于继续诊断基线，不改锁文件 |
| `npm run build` | 通过 |
| `npm run build:android` | 通过 |
| `npx cap sync android` | 通过 |
| `cd android && ./gradlew assembleDebug` | 不适用：项目有意采用方案 B，不提交或使用 Wrapper；该历史尝试不是有效的项目构建命令 |

### 修改后

| 命令/检查 | 结果 |
| --- | --- |
| `npm ci --cache /tmp/codex-npm-cache-farm` | 通过，安装 131 个包 |
| `npm test` | 通过，4/4 |
| `npm run build` | 通过 |
| `npm run build:android` | 通过 |
| `npx cap sync android` | 通过；生成文件在验证后恢复，不纳入提交 |
| 方案 B Android Debug CI | 通过：[Verify Android App #30188726613](https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/actions/runs/30188726613)，使用 Gradle 8.11.1 执行 `gradle assembleDebug`，并确认产出 `app-debug.apk` |
| 360/390/430/1366px 页面自动化 | 通过，无横向溢出，作物按钮均至少 44×44 |
| 普通与快速模式交互自动化 | 通过：即时保存、事件隔离、递归 15 个账号、Esc 退出 |

## 14. 已知但未解决的问题

1. 项目明确采用方案 B，因此仓库不会包含 Gradle Wrapper；Android Debug 和正式签名构建必须依赖 GitHub Actions 的固定 Gradle 8.11.1 与 JDK 21 环境。
2. `npx cap sync android` 会格式化两个 Capacitor 生成文件并生成 `config.xml`；第三阶段只
   保留 Local Notifications 模块映射与依赖，恢复注释/空行并删除无关生成文件。
3. CSS 由多个历史文件叠加，第一阶段仅新增末尾加载的专用样式，没有进行全站 CSS 重构。
4. 本轮没有向真实备份分支写入用户数据；GitHub 备份组件和默认值未修改，构建通过，但真实数据写入仍应由用户在应用中用测试数据复核。
5. 临时 Chromium 的中文字体不可用，不影响 DOM 尺寸与交互断言；布局截图仅用于结构检查。

## 15. 第二阶段详细目标

1. 先从参考项目抽出不依赖 Vue 状态和 DOM 的纯函数；
2. 为 8/16/32 小时作物建立明确配置；
3. 账号作物为未记录时禁止直接计算并给出轻量提示；
4. 本阶段只支持成熟倒计时输入，不复制参考项目的具体时间模式；
5. 输入当前水分剩余；
6. 计算本次浇水减少、浇水后剩余、理论最快剩余、节省时间和预计最快成熟时间；
7. 将同一次计算使用的 `now` 固化，避免跨秒产生不一致；
8. 将结果保存到目标账号，而不是只保存在临时组件状态；
9. 增加边界、非法输入、跨日格式化和 32 小时作物测试；
10. 计算与展示分离，主页只消费结果。

## 16. FarmCalculator 参考版本和代码位置

- 仓库：`foxmaybeOI1761640545/FarmCalculator-1783136145`
- Tag：`20260707-203227-codex-2026-07-07-03-15-40-utc-app-shell-v1.0.6`
- Tag 提交：`66c42e45ebca8b759b95a168f58a5943574bf63f`
- 当前核心代码集中在参考仓库的 `src/App.vue`：
  - 约第 68 行：8/16/32 小时作物参数；
  - 约第 295 行：成熟剩余时间读取与具体时间换算；
  - 约第 337 行：候选日期/时间差；
  - 约第 469 行：核心计算流程；
  - 约第 488–492 行：水分减少与理论最快成熟公式。
- 第二阶段应把这些业务部分抽到本项目新的纯函数模块，例如 `src/domain/farmCalculator.js`，不要复制整个参考组件。

## 17. 第二阶段采用的数据字段

实施后账号使用以下可选字段：

```js
{
  farmSchedule: {
    schemaVersion: 1,
    cropType: '8',
    calculatedAt: 1800000000000,
    matureLeftMinutes: 0,
    waterLeftMinutes: 0,
    reportedMatureAt: 1800000000000,
    nextWaterAt: 1800000000000,
    fastestMatureAt: 1800000000000,
    fastestLeftMinutes: 0,
    savedMinutes: 0,
    elapsedSinceLastWaterMinutes: 0,
    currentWaterReduceMinutes: 0,
    matureAfterWaterMinutes: 0,
  },
}
```

原则：

- 时间使用 Unix 毫秒数，输入与公式快照使用分钟；
- 未记录作物时 `farmSchedule` 必须为 null；
- 作物实际改变后清除旧 schedule，相同作物保留；
- 旧 Schema Version 1 惰性迁移为 `farmSchedule: null`；
- Store 保存和备份导入都调用同一规范化校验。

## 18. 第三阶段提醒和闹钟规划

- Android 优先使用单一原生提醒桥接，评估 `AlarmManager` 或合适的 Capacitor 插件；
- 每个提醒必须可由账号 ID 和提醒类型稳定定位；
- 修改作物或重新计算时更新旧提醒；
- 删除账号时清理所有提醒；
- 应用或设备重启后恢复仍有效的提醒；
- 网页端保存目标时间、显示页面内倒计时，并在权限允许时使用通知；
- 权限不足时提供一键复制目标时间；
- 不把会话 PAT、签名或私密配置写入提醒负载。

## 19. 第四阶段行动排序规划

排序优先级：

1. 已经可以收获；
2. 即将需要浇水；
3. 即将成熟；
4. 正常生长；
5. 尚未设置计时；
6. 尚未记录作物。

排序必须稳定：同优先级保留当前分组和账号顺序。状态颜色应作为辅助信息，仍需文字和无障碍标签。完成“已收获并重新种植”后重置当前轮计算和提醒。

## 20. 第五阶段战令目标提醒规划

- 目标固定为战令 40 级时，未达到显示剩余级数；
- 达到 40 级显示已满足领取条件；
- 只在接近或达到目标时考虑主页轻量提示；
- 不允许战令提醒遮挡农场高频操作；
- 不删除现有账号等级、皮肤、系统或平台资料。

## 21. 数据迁移和备份兼容策略

1. Schema Version 1 和 2 继续作为可导入的旧格式；
2. 水合层负责把缺失或非法 `cropType` 规范化为 `''`；
3. 旧 `8/16/32` 字符串不转换含义；
4. 导出允许 `cropType: ''`；
5. 第三阶段导出升级为 Schema Version 3，并包含合法 `farmSchedule` 和 `farmReminders`；
6. Schema 1 补充空 schedule/reminders；Schema 2 恢复 schedule 并补充空 reminders；
   Schema 3 恢复二者并在整棵树修复通知 ID；
7. 导入始终先校验备份对象、应用名和根分组结构；
8. PAT 与 GitHub 配置不进入数据快照；
9. 不修改无关的备份仓库默认值。
10. v1.0.12 重新导出会丢失提醒字段，降级前必须保留 Schema 3 JSON。

## 22. Android 注意事项

- 返回键顺序保持：顶层确认/弹窗 → 农场计算面板 → 批量模式 → 快速记录 → 完整编辑取消 → WebView 历史；
- 快速记录通过现有注册处理器接入，不新增原生监听；
- 表单 Enter 导航由 `installFormEnterNavigation` 统一管理；
- 输入框继续保留 Android 软键盘滚动余量和 `enterkeyhint`；
- 保留安全区域、动态视口、固定顶部和底部；
- 不破坏 `AppUpdatePlugin.kt`、应用内更新入口及发布版本校验；
- 不修改签名文件、Repository Secrets 或固定签名工作流；
- 发布继续遵守 `docs/IMMUTABLE_RELEASE.md`；
- 不得新增 Gradle Wrapper；CI 中只使用固定 Gradle 8.11.1 和 JDK 21；
- Android Debug 与签名发布构建以 GitHub Actions 结果为权威结果。
- 精确提醒只声明 `SCHEDULE_EXACT_ALARM`，不得加入 `USE_EXACT_ALARM`；
- 普通通知权限和开机恢复 receiver 由官方插件 Manifest 提供；
- 首次启动不得请求通知或精确提醒权限；必须由用户明确操作触发；
- 完整限制、频道与 Manifest 清单见 `docs/FARM_REMINDERS.md`。

## 23. 不允许破坏的功能

- 本地账号数据；
- Schema Version 1 备份；
- GitHub 备份；
- 分组新增、排序和删除；
- 账号新增、详情编辑和删除；
- 账号等级、战令、农场等级、皮肤、系统和平台；
- Android 系统返回键；
- 表单 Enter 跳转；
- Android 软键盘和安全区域；
- 应用内更新；
- 固定签名构建；
- Release Immutability；
- `gh-pages`、备份数据分支、Release 和 Tag 历史。

## 24. 下一位 AI 的具体开始步骤

1. 完整阅读本文件；
2. 检查不可变 v1.0.12 Tag、当前第三阶段分支和远程 Draft PR，不要从 `main` 猜测状态；
3. 执行 `git status -sb`，确认没有无关改动；
4. 执行 `npm ci`、`npm test`、`npm run build`、`npm run build:android` 和 `npm run sync:android`；
5. 确认方案 B 工作流继续使用 Gradle 8.11.1、JDK 21 和系统 `gradle` 命令，不得新增 Wrapper；
6. 第三阶段变更必须保持 `farmSchedule`、`farmReminders` 和系统 pending 通知一致；
7. 保持 PR 为 Draft，不合并、不触发 Android Signed Release、不创建 v1.0.13；
8. 不修改 v1.0.12 Tag、`main` 或 `future/1784566876/AndroidApp`；
9. 不提前实现全屏闹钟、第四阶段排序或第五阶段战令提醒；
10. 修改完成后更新本文件的测试、风险、PR 和提交记录。

## 25. 更新日志

| 日期 | 提交 SHA | 完成内容 |
| --- | --- | --- |
| 2026-07-26 | `68c3d93` | 统一作物模型；支持未记录；增加原子更新、递归账号读取、自动化测试；同步锁文件 |
| 2026-07-26 | `028937a` | 主页直接循环作物；新增快速记录模式；兼容详情编辑；接入 Esc 与 Android 返回键；增加响应式样式 |
| 2026-07-26 | `4f3ff8a` | 抽取农场时间纯计算、固定业务参数、schedule 校验与统一格式化 |
| 2026-07-26 | `3e90574` | 增加 farmSchedule Store 原子方法、批量更新/撤销和 Schema 2 迁移 |
| 2026-07-26 | `551de1d` | 增加批量选择与确认、快速计算面板、主页时间展示和返回键优先级 |
| 2026-07-26 | `c595e6c` | 增加计算公式、批量/撤销和 Schema 1/2 迁移测试 |

## 26. 第二阶段批量作物与撤销设计

操作路径：

1. 从当前分组进入“快速记录”；
2. 点击“批量调整”；
3. 选择账号，或全选当前递归范围；
4. 从 `--- / 8 / 1 / 3` 选择固定目标；
5. 点击“将 N 个账号设为 X 小时作物”；
6. 在单次确认中核对数量、目标和分组范围；
7. 一次完成 Store 原子修改。

`setServersCropType` 先去重 ID，忽略不存在或不是账号的 ID，只修改作物实际变化的账号。实际变化会清除旧 `farmSchedule`；相同作物计入 skipped 并保留 schedule。最近一次批量操作的 changes 快照只保存在快速记录页面内存中，离开页面即清除。撤销调用 `restoreServersCropState`，逐个恢复 changes 中的原作物与原 schedule，不重新导入整棵账号树。

## 27. 第二阶段 FarmCalculator 公式

公式来源：

- 参考仓库：`foxmaybeOI1761640545/FarmCalculator-1783136145`
- 参考 Tag：`20260707-203227-codex-2026-07-07-03-15-40-utc-app-shell-v1.0.6`
- 参考提交：`66c42e45ebca8b759b95a168f58a5943574bf63f`
- 只抽取指定 `src/App.vue` 中的固定参数、校验与核心公式，没有复制界面、具体时间模式或原生返回监听。

统一参数：

| 作物 | 基础成熟 | 水分最大维持 |
| --- | ---: | ---: |
| 8 小时 | 480 分钟 | 160 分钟 |
| 16 小时 | 960 分钟 | 320 分钟 |
| 32 小时 | 1920 分钟 | 640 分钟 |

计算顺序为：已消耗水分 → 本次浇水减少 → 浇水后剩余 → `4/5` 理论最快剩余 → 理论节省。`fastestMatureAt` 严格按参考项目对 `fastestLeftMinutes × 60` 秒向上取整。同一次计算只使用一个 `now`，预览不会写入账号；只有点击“保存结果”才调用 `setServerFarmSchedule`。

## 28. 第二阶段 farmSchedule 与 Schema 2

```js
farmSchedule: {
  schemaVersion: 1,
  cropType: '8',
  calculatedAt: 1800000000000,
  matureLeftMinutes: 420,
  waterLeftMinutes: 80,
  reportedMatureAt: 1800025200000,
  elapsedSinceLastWaterMinutes: 80,
  currentWaterReduceMinutes: 20,
  matureAfterWaterMinutes: 400,
  fastestLeftMinutes: 320,
  savedMinutes: 100,
  nextWaterAt: 1800004800000,
  fastestMatureAt: 1800019200000,
}
```

- 新账号和 v1.0.11 旧账号默认 `farmSchedule: null`；
- 时间戳必须为有限正数，分钟必须为有限非负数；
- schedule 作物必须与账号当前合法作物一致；
- 未记录作物不能保存 schedule；
- Schema 2 导出包含合法 schedule，不包含 PAT；
- Schema 1 与无外层 Schema 的旧根对象导入后 schedule 为 null；
- Schema 2 非法或不完整 schedule 在导入时丢弃；
- 详细降级说明见 `docs/FARM_WORKFLOW_DATA.md`。

## 29. 第二阶段主页与计算面板

主页仍保持紧凑双列。账号卡片主体进入详情，作物方块切换作物，删除按钮只打开删除确认，底部时间区域打开计算面板，四类点击互相隔离。未记录作物点击时间区域会显示“请先设置当前作物类型”，并把焦点移到作物按钮。

计算面板只提供倒计时输入，自动带入账号当前作物。四个数字输入框继续复用全局 Enter 导航，最后一项 Enter 执行计算。结果预览显示理论最快成熟、下一次浇水、当前预计成熟和理论节省，并提供“保存结果”“重新输入”“取消”。

Esc 与 Android 返回键顺序为：最上层确认/弹窗 → 计算面板 → 批量模式 → 快速记录 → 完整编辑 → 页面历史。仍只使用 `nativeAppShell.js` 的单一 Capacitor 返回监听。

## 30. 第二阶段验证记录

| 命令/检查 | 当前结果 |
| --- | --- |
| `npm test` | 通过，23/23 |
| `npm run build` | 通过 |
| 360/390/430/1366px 自动化 | 通过，无横向溢出；批量栏、复选框、只读作物方块和主页时间行未重叠 |
| 计算面板交互 | 通过；预览不提前保存，明确保存后持久化，未记录作物会聚焦作物按钮 |
| 批量与撤销交互 | 通过；不同作物清除 schedule，一次撤销恢复作物和 schedule |
| 360×500 软键盘收缩模拟 | 通过；Enter 导航后最后输入框保持在可见视口 |
| Esc 优先级 | 通过；批量确认、批量模式和快速记录按顺序退出 |
| `npm ci` | 通过，安装 131 个包 |
| `npm run build` | 通过 |
| `npm run build:android` | 通过 |
| `npm run sync:android` | 通过；验证后恢复 Capacitor 生成文件格式差异，不提交无关改动 |
| 方案 B Android Debug CI | 通过：[Verify Android App #30190940979](https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/actions/runs/30190940979)，下载确认 `app-debug.apk` 为 3,921,689 bytes |

## 31. 第二阶段未实现与风险

未实现且不得提前开始：全屏闹钟、自动拉起游戏、Service Worker 后台网页通知、每秒
刷新、自动排序、红黄绿紧急状态和战令提醒。

已知风险：

1. 当前执行环境没有真实 Android 设备，软键盘和系统返回键以响应式浏览器自动化、单一监听代码路径和方案 B Debug CI 为验证依据；
2. v1.0.11 重新导出会丢失第二阶段字段，降级前必须保存 Schema 2 JSON；
3. 批量撤销只保留页面内最近一次操作，离开快速记录后不可撤销；
4. 第三阶段用单一 30 秒共享时钟刷新倒计时，网页关闭后不保证通知；
5. 第三阶段 Draft PR 不合并，因此不会触发 Android Signed Release 或创建 v1.0.13。

## 32. 第二阶段 PR 与提交

- 开发分支：`future/1785045626/FarmWorkflowPhase2`
- PR Base：`future/1784566876/AndroidApp`
- Draft PR：[PR #9](https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/pull/9)
- 合并：历史上已通过六个提交纯 fast-forward 进入 AndroidApp，没有 Merge Commit
- 发布：已创建不可变 v1.0.12 Beta Pre-release

完整实现提交：

| 提交 | 内容 |
| --- | --- |
| `4f3ff8afa92a720ec381cd343b3c2d8a9dbb1d50` | 农场成熟时间纯计算、参数、校验与格式化 |
| `3e905748ce8371d58341f50de410df301dfb265a` | farmSchedule、Store 原子方法、批量/撤销与 Schema 2 |
| `551de1df5566a6ff135f3cbcfdd5021e1d2f3581` | 批量 UI、计算面板、主页时间入口和返回键 |
| `c595e6c864e236feebe2ffa8849498b7bf79d91c` | 计算、批量、撤销和迁移测试 |
| `013a23384dfb612d0025f5326d582a78683aa663` | 第二阶段路线和数据兼容说明 |

第二阶段修改文件：

- `src/domain/farmCalculator.js`
- `src/domain/accountBackup.js`
- `src/composables/useAccountStore.js`
- `src/components/BackupCenter.vue`
- `src/components/QuickCropRecorder.vue`
- `src/components/FarmTimeCalculator.vue`
- `src/components/GroupBrowser.vue`
- `src/App.vue`
- `src/platform/nativeAppShell.js`
- `src/farm-workflow-phase2.css`
- `src/main.js`
- `tests/farmCalculator.test.js`
- `tests/accountStoreFarm.test.js`
- `tests/backupMigration.test.js`
- `docs/FARM_WORKFLOW_DATA.md`
- `FARM_WORKFLOW_ROADMAP.md`

## 33. 第三阶段实现决策

1. 唯一基线是不可变 Tag
   `20260726-160013-future-1784566876-AndroidApp-v1.0.12`，提交
   `402205201939727d4c1dc6c5e21eb32772b205eb`。
2. 官方 `@capacitor/local-notifications` 固定为 `7.0.7`，只有
   `src/platform/farmReminderAdapter.js` 导入插件。
3. 使用 `SCHEDULE_EXACT_ALARM` 是因为 Android 12+ 的精确提醒需要用户可撤销的特殊
   访问；不使用 `USE_EXACT_ALARM`，因为本应用并非系统闹钟或日历核心用途。
4. 能力明确区分 `exact`、`inexact`、`denied` 与 `unsupported`。普通通知被拒绝时
   取消系统 pending 提醒并保留用户偏好，不宣称设置成功。
5. 固定频道为 `farm-water-reminders-v1` 和 `farm-harvest-reminders-v1`，private
   锁屏可见性、声音和振动；小图标为白色矢量 `ic_stat_farm_reminder`。
6. 通知 ID 从账号 ID 和 water/harvest 类型确定性分配，在整棵树内修复重复与非法
   32 位 ID，保留合法未冲突 ID。
7. 协调器对“数据期望计划”和系统 pending 通知做幂等差异同步。重新计算保留 ID 并
   重排目标；作物变化、删除账号/分组时取消对应 pending 和 delivered 通知。
8. 应用启动创建频道和校准，但不请求权限；恢复前台重新检查权限并校准。设备重启由
   官方插件 Manifest 的 restore receiver 恢复未来提醒。
9. 网页端使用单一 30 秒共享时钟；启动时先 prime 过期目标，避免刷新补发，只对页面
   保持打开期间跨越到期点的计划通知一次。
10. 通知负载只含账号定位和动作所需的最小字段，不含 PAT、GitHub 配置、皮肤、战令、
    备份或签名信息。

## 34. 第三阶段 Schema 3

```js
farmReminders: {
  schemaVersion: 1,
  water: {
    enabled: true,
    notificationId: 627617530,
  },
  harvest: {
    enabled: true,
    notificationId: 644395149,
  },
  updatedAt: 1800000000000,
}
```

- Schema 1 导入后 schedule/reminders 均为空；
- Schema 2 恢复合法 schedule，reminders 为空；
- Schema 3 恢复合法 schedule/reminders，并全树修复 ID；
- schedule 不存在、非法或与当前作物不匹配时 reminders 丢弃；
- 目标时间不重复保存，而是读取 `nextWaterAt` 与 `fastestMatureAt`；
- 权限、pending/delivered 和平台错误不持久化；
- 导入函数不调用插件，成功替换数据后再由协调器校准；
- 详细兼容和降级说明见 `docs/FARM_WORKFLOW_DATA.md`。

## 35. 第三阶段 UI 与权限流程

计算成功后可以选择浇水和收获提醒。新账号首次默认勾选二者；水已经到期时该项仍可
展示但不会补发过期系统通知。用户可：

- “保存并设置提醒”：保存 schedule 和提醒意图，再进入权限流程；
- “仅保存时间”：已有提醒则保留偏好并随新目标更新，没有提醒则不新增；
- 在已有日程的提醒设置区分别开关两类提醒；
- 查看实时倒计时、明确时间和 exact/inexact/denied/web 状态；
- 打开精确提醒设置，或复制浇水、收获和全部时间。

首次启动不弹权限。用户明确开启提醒后先显示用途说明，Android 13+ 才请求普通通知
权限；精确提醒另有独立说明和系统设置入口。拒绝后保留计算结果和页面倒计时。权限
弹层优先于计算面板、批量模式、快速记录和编辑；仍复用单一 Android 返回监听。

## 36. 第三阶段自动化与构建记录

| 命令/检查 | 当前结果 |
| --- | --- |
| `npm test` | 本地通过，54/54 |
| `npm run build` | 本地通过 |
| `npm run build:android` | 本地通过 |
| `npm run sync:android` | 本地通过；只保留插件模块映射和依赖 |
| Android Manifest 静态输入 | 检查 SCHEDULE/无 USE、插件权限与三个 receiver |
| 360/390/430/1366 与 360×500 无头 Chromium | 无横向溢出；44×44 作物按钮；提醒项 ≥59px；权限弹层 → 计算面板 Esc 优先级通过 |
| 方案 B Android Debug CI | 通过：[Verify Android App #30195662979](https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/actions/runs/30195662979)；所有步骤成功 |
| Debug APK Artifact | `app-debug.apk`，3,956,956 bytes；Artifact SHA-256 digest `893658c6df10ef26b99a6e23a7485101747dc77829d9a90721d1e30189ef06e4` |
| 最终 APK Manifest | 已从 Artifact 解析：包含 SCHEDULE、POST、BOOT、WAKE_LOCK 和三个插件 receiver；无 USE_EXACT_ALARM |
| Android 真机/模拟器 | 当前环境无设备，未实测 |

自动化覆盖通知 ID、冲突修复、计划内容和隐私、Store 作物/计算/批量/删除联动、
Schema 1/2/3、Fake Adapter exact/inexact/denied/过期/容错/幂等，以及固定时钟网页
通知去重。

## 37. 第三阶段设备未实测项与风险

当前环境没有 Android 模拟器或真机，因此以下项目明确未实测：

- Android 13/14 首次授权、拒绝和再次操作；
- 前台、后台、锁屏、Doze 和强制结束后的声音/振动通知；
- 通知点击定位账号；
- 关闭精确提醒权限后的系统实际清理行为；
- 设备重启后的提醒恢复；
- v1.0.12 覆盖安装 Debug APK 后 localStorage 保留。

方案 B Debug CI 只能证明插件编译、Manifest 合并和 APK 产出，不能替代设备行为测试。
此外，Doze/厂商省电可能延迟提醒；Android 15 Private Space 锁定期间通知也可能延迟，
且应用无法可靠检测自己是否在 Private Space。网页标签关闭后不保证通知。回退方式是
关闭系统提醒并继续使用页面倒计时、明确时间和复制功能；数据可用 Schema 3 JSON
保留，降级到 v1.0.12 前必须先保存该备份。

## 38. 第三阶段分支、提交和 Draft PR

- 开发分支：`future/1785054684/FarmWorkflowPhase3`
- PR Base：`future/1784566876/AndroidApp`
- Draft PR：[PR #10](https://github.com/foxmaybeOI1761640545/WangZheRongYao-1784465435/pull/10)
- 合并：禁止
- 发布：禁止，不创建 v1.0.13，不修改不可变 v1.0.12 Release/Tag

实现提交：

| 提交 | 内容 |
| --- | --- |
| `738e28e` | 提醒领域模型、稳定 ID、计划、倒计时与隐私测试 |
| `e25d53e` | Store 联动、Schema 3、迁移和批量/删除测试 |
| `6dc2f12` | Local Notifications、Android 权限/频道、协调器与 Fake Adapter 测试 |
| `294e9ff` | 网页时钟、浏览器通知、设置 UI、响应式样式和弹层优先级 |
| `fbc450c` | 第三阶段路线、数据兼容、Android 与提醒设计文档 |

Release API 复核结果：最新 Release 仍为 2026-07-26 发布的不可变 v1.0.12 Beta
Pre-release；没有创建 v1.0.13。PR 保持 Draft，未合并，未触发 Android Signed Release。
