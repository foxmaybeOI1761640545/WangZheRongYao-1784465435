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

当前只完成第一阶段，没有提前引入计算公式、倒计时、通知或闹钟。

## 3. 唯一开发基线

- 仓库：`foxmaybeOI1761640545/WangZheRongYao-1784465435`
- Release Tag：`20260724-163721-future-1784566876-AndroidApp-v1.0.10`
- 基线提交：`5e0d30cd3e10f404c17a9881e1435d7d295b95e9`
- 基线分支来源：直接从上述 Tag 创建，不修改 Tag、`main` 或原 Android 分支。

## 4. 当前开发分支

- 分支：`future/1785038335/FarmWorkflowPhase1`
- 阶段：第一阶段——降低作物记录成本
- 合并状态：未合并
- 发布状态：第一阶段功能已完成，正在进行 v1.0.11 Beta Pre-release 发布前验证

## 5. 当前技术栈

- Vue `3.5.39`，Composition API 与单文件组件；
- Vite `8.1.0`；
- Capacitor Core/Android/CLI `7.6.7`；
- `@capacitor/app` `7.1.2`；
- Android Java/Kotlin 混合壳层；
- 浏览器 `localStorage` 本地持久化；
- GitHub Contents API 数据备份；
- Node 内置 Test Runner；
- GitHub Actions 固定签名与不可变 Release 流程。

## 6. 关键目录与文件职责

| 路径 | 职责 |
| --- | --- |
| `src/domain/cropTypes.js` | 作物合法值、代码、标签、规范化和循环纯函数 |
| `src/composables/useAccountStore.js` | 数据水合、树操作、即时持久化、原子作物更新、递归账号读取 |
| `src/components/GroupBrowser.vue` | 普通主页、账号卡片主体导航、作物直接循环、快速记录入口 |
| `src/components/QuickCropRecorder.vue` | 紧凑单列快速记录模式 |
| `src/components/ServerDetail.vue` | 详情展示、单项编辑与完整资料编辑 |
| `src/components/BackupCenter.vue` | Schema Version 1 导入导出与 GitHub 备份 |
| `src/App.vue` | 路由、弹窗、快速记录模式生命周期、Esc 和 Android 返回键优先级 |
| `src/platform/nativeAppShell.js` | Capacitor 原生返回键桥接与表单 Enter 导航 |
| `src/quick-crop-recorder.css` | 普通主页作物按钮覆盖及快速记录响应式样式 |
| `tests/cropTypes.test.js` | 作物模型、旧数据、即时持久化、原子更新和递归顺序测试 |
| `docs/ANDROID*.md` | Android 构建、更新与签名说明 |
| `docs/IMMUTABLE_RELEASE.md` | Release Immutability 流程 |

## 7. 当前账号数据结构

第一阶段保持 Schema Version 1，不增加计时字段。账号节点结构为：

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
  epicSkins: '',
  createdAt: 0,
}
```

分组节点继续使用 `children` 保存子分组和账号。`id`、`parentId`、`createdAt` 与其他资料不会被主页作物快速修改覆盖。

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
- [ ] 合并并发布 v1.0.11 Beta Pre-release。

## 11. 尚未完成

### 第二阶段

- [ ] 抽取 FarmCalculator 纯计算逻辑；
- [ ] 从账号作物自动选择 8/16/32 小时参数；
- [ ] 输入当前成熟剩余和当前水分剩余；
- [ ] 保存计算时间、理论最快成熟时间和下一次浇水时间；
- [ ] 在账号卡片展示计算结果。

### 第三阶段

- [ ] 网页倒计时与浏览器通知；
- [ ] Android 原生通知和闹钟；
- [ ] 重启恢复、修改更新和删除清理提醒。

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
2. `npx cap sync android` 会格式化两个 Capacitor 生成文件并生成 `config.xml`；验证后已恢复，避免提交无关生成差异。
3. CSS 由多个历史文件叠加，第一阶段仅新增末尾加载的专用样式，没有进行全站 CSS 重构。
4. 本轮没有向真实备份分支写入用户数据；GitHub 备份组件和默认值未修改，构建通过，但真实数据写入仍应由用户在应用中用测试数据复核。
5. 临时 Chromium 的中文字体不可用，不影响 DOM 尺寸与交互断言；布局截图仅用于结构检查。

## 15. 第二阶段详细目标

1. 先从参考项目抽出不依赖 Vue 状态和 DOM 的纯函数；
2. 为 8/16/32 小时作物建立明确配置；
3. 账号作物为未记录时禁止直接计算并给出轻量提示；
4. 支持成熟倒计时和具体时间两种输入语义时，必须保留参考项目的有效日期判断；
5. 输入当前水分剩余；
6. 计算本次浇水减少、浇水后剩余、理论最快剩余、节省时间和预计最快成熟时间；
7. 将同一次计算使用的 `now` 固化，避免跨秒产生不一致；
8. 将结果保存到目标账号，而不是只保存在临时组件状态；
9. 增加边界、非法输入、跨日和 32 小时作物测试；
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

## 17. 第二阶段计划增加的数据字段

字段名在实施前仍需通过测试和迁移设计确认，建议最小集合：

```js
{
  calculation: {
    calculatedAt: 'ISO-8601',
    matureLeftMinutes: 0,
    waterLeftMinutes: 0,
    fastestMatureAt: 'ISO-8601',
    nextWaterAt: 'ISO-8601',
  },
}
```

原则：

- 不保存可由其他字段稳定推导的重复值；
- 时间使用绝对 ISO 时间，输入快照保留分钟值；
- 未记录作物时 `calculation` 应为空；
- 作物改变后必须明确清除或标记旧计算失效；
- 增加字段前先设计旧 Schema Version 1 的惰性迁移与备份兼容测试。

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

1. Schema Version 1 当前继续有效；
2. 水合层负责把缺失或非法 `cropType` 规范化为 `''`；
3. 旧 `8/16/32` 字符串不转换含义；
4. 导出允许 `cropType: ''`；
5. 第一阶段不提升 Schema 版本；
6. 第二阶段若增加嵌套字段，优先采用可缺省结构并增加往返测试；
7. 导入始终先校验备份对象、应用名和根分组结构；
8. PAT 与 GitHub 配置不进入数据快照；
9. 不修改无关的备份仓库默认值。

## 22. Android 注意事项

- 返回键顺序保持：顶层弹窗 → 完整编辑取消 → 注册处理器 → WebView 历史；
- 快速记录通过现有注册处理器接入，不新增原生监听；
- 表单 Enter 导航由 `installFormEnterNavigation` 统一管理；
- 输入框继续保留 Android 软键盘滚动余量和 `enterkeyhint`；
- 保留安全区域、动态视口、固定顶部和底部；
- 不破坏 `AppUpdatePlugin.kt`、应用内更新入口及发布版本校验；
- 不修改签名文件、Repository Secrets 或固定签名工作流；
- 发布继续遵守 `docs/IMMUTABLE_RELEASE.md`；
- 不得新增 Gradle Wrapper；CI 中只使用固定 Gradle 8.11.1 和 JDK 21；
- Android Debug 与签名发布构建以 GitHub Actions 结果为权威结果。

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
2. 检查当前分支与远程 PR，不要从 `main` 猜测状态；
3. 执行 `git status -sb`，确认没有无关改动；
4. 执行 `npm ci`、`npm test` 和 `npm run build`；
5. 确认方案 B 工作流继续使用 Gradle 8.11.1、JDK 21 和系统 `gradle` 命令，不得新增 Wrapper；
6. 若开始第二阶段，只读参考 FarmCalculator 指定 Tag；
7. 先抽取纯计算逻辑和测试，不复制 UI；
8. 设计新增字段与 Schema Version 1 兼容策略；
9. 不提前实现第三阶段闹钟、第四阶段排序或第五阶段战令提醒；
10. 修改完成后更新本文件的阶段、测试、风险和提交记录。

## 25. 更新日志

| 日期 | 提交 SHA | 完成内容 |
| --- | --- | --- |
| 2026-07-26 | `68c3d93` | 统一作物模型；支持未记录；增加原子更新、递归账号读取、自动化测试；同步锁文件 |
| 2026-07-26 | `028937a` | 主页直接循环作物；新增快速记录模式；兼容详情编辑；接入 Esc 与 Android 返回键；增加响应式样式 |
