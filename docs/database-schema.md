# Database Schema

本文档描述逻辑 schema。第一版可用 IndexedDB 实现，但表设计保持接近 SQLite，方便未来迁移到 Mac/iOS 本地数据库。

## 命名约定

- 主键统一为 `id`，字符串 UUID。
- 时间戳统一为 ISO UTC string。
- 日期字段为记录发生时区下的本地日期字符串 `YYYY-MM-DD`。
- 参与按天归属的记录保存 IANA `time_zone`，例如 `Asia/Tokyo`、`America/Los_Angeles`。
- 旧数据或旧备份缺少 `time_zone` 时按 `Asia/Tokyo` 兼容回填。
- 时长字段明确单位，例如 `_minutes`、`_seconds`。
- 删除优先使用软删除字段 `deleted_at`。

## labels

保存状态、产物、不专注原因等可扩展标签。内部类型名 `blocker` 沿用早期命名，用户界面显示为“不专注原因”。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| type | string | `session_status`、`product`、`blocker` |
| name | string | 标签名称 |
| color | string nullable | UI 颜色 |
| is_default | boolean | 是否系统默认 |
| is_active | boolean | 是否可选 |
| sort_order | number | 排序 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

默认标签：

- session_status：完成、部分完成、被打断、卡住、放弃/转移。
- blocker：无、不清楚、太难、太无聊、害怕做差、太累、被打断。
- product：笔记、代码、文件、录音、PPT、阅读摘录、练习题、其他。

规则：

- `is_active = false` 表示归档。归档标签不会出现在新的复盘选择中，但历史记录仍通过标签 id 参与统计。
- `deleted_at` 表示软删除。已有历史复盘引用的标签不能删除，只能归档。
- `status-completed` 是系统保留状态，用于点阵“专注”判定；可以改名和改颜色，但不能归档或删除。

## arrival_sessions

记录用户到岗/学习位置的时间段，用于计算拖延。内部派生字段仍称 `startup_delay`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| local_date | string | 到岗所在本地日期 |
| time_zone | string | 到岗发生时区 |
| arrived_at | datetime | 到岗时间 |
| left_at | datetime nullable | 离开时间 |
| note | text nullable | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

派生字段：

- `startup_delay_minutes` 不必作为源字段保存；界面显示为“拖延”。
- 计算方式：从 canonical timeline 派生。到岗区间先作为拖延底色，再用休息、有效专注片段和已复盘不专注片段覆盖；剩余等待时间就是拖延。兼容层仍可保留“到岗到第一轮开始”的诊断工具，但它不是 Today/Analytics 的统计来源。

## focus_sessions

保存每轮番茄钟或自定义倒计时。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| arrival_session_id | string nullable | 关联到岗记录 |
| local_date | string | 开始时所在本地日期 |
| time_zone | string | 开始时所在时区 |
| planned_duration_minutes | number | 计划时长 |
| actual_duration_minutes | number nullable | 实际完成时长 |
| started_at | datetime | 开始时间 |
| paused_total_seconds | number | 暂停总秒数 |
| current_pause_started_at | datetime nullable | 当前暂停开始时间，用于刷新后恢复暂停状态 |
| completed_at | datetime nullable | 完成时间 |
| canceled_at | datetime nullable | 取消时间 |
| state | string | `running`、`paused`、`completed`、`reviewed`、`canceled` |
| earned_break_minutes | number | 本轮写入今日学习累计账本后，新跨过 25 分钟门槛产生的休息分钟 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

规则：

- 只有 `completed` 或 `reviewed` 的记录进入专注时长统计；当前统计主要使用已复盘的 `reviewed` 记录。
- `reviewed` 表示已完成结束复盘。
- 真实专注发生在哪些时间段不只靠 `started_at + actual_duration_minutes` 推断，优先读取 `focus_segments`。
- Today 页面“手动记录”也写入本表：它直接创建 `reviewed` 记录，`planned_duration_minutes` 和 `actual_duration_minutes` 等于用户输入的持续分钟，`arrival_session_id` 可以为空，且不会修改到岗记录。
- 手动记录的 `actual_duration_minutes` 和普通番茄钟一样参与当天休息余额动态累计。
- 手动记录不能和已有有效专注区间重叠。重叠判断优先读取 `focus_segments`，并用 `actual_duration_minutes`/计划时长封顶，不直接把 `completed_at - started_at` 的整段墙钟时间当作专注。

## focus_segments

保存每轮番茄钟下真实发生的专注片段，用于支持“暂停后进入拖延，继续后接着同一轮”的时间线。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string | 关联 focus session |
| local_date | string | 片段开始时所在本地日期 |
| time_zone | string | 片段开始时所在时区 |
| started_at | datetime | 片段开始时间 |
| ended_at | datetime nullable | 片段结束时间 |
| state | string | `running`、`completed`、`canceled` |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

规则：

- 开始番茄钟时创建第一条 `running` segment。
- 点击暂停时关闭当前 segment，后续时间继续由打开的 arrival session 记录为拖延。
- 点击继续时在同一 focus session 下创建新的 `running` segment。
- 点击完成时关闭当前 segment，并按有效专注分钟结束 focus session。
- 点击取消时将本轮 segments 标记为 `canceled`，不进入专注统计。
- 旧数据或旧导入文件可能没有 segments；统计点阵可回退到 `focus_sessions.started_at + actual_duration_minutes` 的连续区间。
- 手动记录保存时会创建一条 completed segment，覆盖用户输入的开始时间到结束时间。

## session_reviews

保存每轮结束后的复盘。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string | 关联 focus session |
| status_label_id | string | 五种状态之一或自定义状态 |
| attention_switch_count | number | 注意力切换次数 |
| product_note | text nullable | 可见产物文字 |
| blocker_note | text nullable | 不专注原因补充说明 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

约束：

- 每个 focus session 最多一条有效 review。
- `attention_switch_count >= 0`。
- 手动记录保存时会同步创建 review，因此不会进入“待复盘”状态，也不会显示休息使用选择。

## session_review_labels

复盘和标签的多对多关系。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| review_id | string | 关联 session_reviews |
| label_id | string | 关联 labels |
| label_type | string | 冗余保存类型，便于查询 |
| created_at | datetime | 创建时间 |

规则：

- `label_type` 应与 labels.type 一致。
- product 和 blocker 使用此表；`blocker` 在 UI 中显示为“不专注原因”。
- status 单选，直接放在 `session_reviews.status_label_id`。

## break_bank_transactions

保存休息使用和退回记录。休息“赚取”不再作为长期余额交易写入，而是从当天 `focus_sessions.actual_duration_minutes` 动态计算。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string nullable | 来源 focus session |
| local_date | string | 本地日期 |
| time_zone | string | 交易发生时区 |
| type | string | `earned`、`used`、`adjustment`。`earned` 只作为旧备份兼容 |
| minutes | number | 正数表示增加，负数表示减少 |
| note | text nullable | 备注 |
| created_at | datetime | 创建时间 |

规则：

- 今日已完成番茄钟真实有效分钟每累计满 25 分钟，动态获得 5 分钟今日休息余额；未满 25 分钟的进度不跨天。
- 使用休息时写入 `used`，`minutes` 为负数。
- 提前结束休息时可以写入 `adjustment`，把未用完分钟退回余额。
- 当前余额 = 今日动态赚取休息 + 今日 `used`/`adjustment` 交易。昨天未用完余额不进入今天。
- 旧备份如果只有 `earned` 交易且没有可用于动态计算的 focus sessions，会按 `earned` 交易兼容读取。

## break_sessions

保存正在进行或已结束的休息倒计时。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string nullable | 来源 focus session |
| local_date | string | 本地日期 |
| time_zone | string | 休息发生时区 |
| planned_duration_minutes | number | 计划休息时长 |
| actual_duration_minutes | number nullable | 实际使用休息分钟 |
| started_at | datetime | 休息开始时间 |
| completed_at | datetime nullable | 休息结束时间 |
| canceled_at | datetime nullable | 取消时间，预留 |
| ended_early | boolean nullable | 是否提前结束 |
| state | string | `running`、`completed`、`canceled` |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

规则：

- 复盘选择“使用休息”时创建 `running` 记录。
- 休息自然结束或提前结束时改为 `completed`。
- 休息记录覆盖到岗时间线中的休息区间，因此休息中不计算为拖延；休息开始、结束或继续休息都不关闭、重开或重置 arrival session。

## sleep_logs

每日睡眠记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| local_date | string | 日期，唯一 |
| time_zone | string | 记录归属时区 |
| sleep_duration_minutes | number | 睡眠时长 |
| energy_score | number | 主观精力 1-5 |
| note | text nullable | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

约束：

- `local_date` 对有效记录唯一。
- `sleep_duration_minutes >= 0`。
- `energy_score` 在 1 到 5 之间。

## app_settings

保存本地偏好。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| key | string | 主键 |
| value_json | text | JSON 字符串 |
| updated_at | datetime | 更新时间 |

推荐初始设置：

```json
[
  {
    "key": "timer",
    "value_json": {
      "defaultFocusMinutes": 25,
      "breakEarnedPerFocusBlockMinutes": 5,
      "focusBlockMinutes": 25,
      "allowBreakCarryOver": true
    }
  },
  {
    "key": "timelineColors",
    "value_json": {
      "empty": "#f0efed",
      "startup_delay": "#e05c54",
      "break": "#63b3ed",
      "focus": "#2f855a",
      "blocked": "#d49a24"
    }
  }
]
```

说明：`allowBreakCarryOver` 是早期设置字段，当前每日学习累计账本不再读取它；实际产品规则是休息余额和未满 25 分钟进度都不跨天。该字段保留只是为了兼容已写入的本地设置。

说明：`timelineColors` 只影响点阵图和图例展示颜色，不改变标签自身颜色。

## 可选缓存：daily_rollups

后续数据量变大后可以添加，不作为 MVP 必需表。当前 Dexie schema 已到 version 4，version 4 为按天源记录增加 `time_zone` 索引和旧数据回填。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| local_date | string | 日期，主键 |
| time_zone | string | 聚合归属时区，可选 |
| focus_minutes | number | 当日专注分钟 |
| blocked_minutes | number | 当日不专注分钟 |
| startup_delay_minutes | number | 当日拖延分钟，内部仍沿用 startup delay 字段名 |
| attention_switch_count | number | 当日注意力切换 |
| earned_break_minutes | number | 当日新增休息 |
| used_break_minutes | number | 当日使用休息 |
| calculated_at | datetime | 计算时间 |

规则：

- 任何时候都必须能从源表重算。
- 如果未来做 rollup，需要明确它是“某日期 + 某时区”的缓存，不能用当前设备时区重新解释旧记录。
