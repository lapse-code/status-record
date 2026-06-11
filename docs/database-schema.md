# Database Schema

本文档描述逻辑 schema。第一版可用 IndexedDB 实现，但表设计保持接近 SQLite，方便未来迁移到 Mac/iOS 本地数据库。

## 命名约定

- 主键统一为 `id`，字符串 UUID。
- 时间戳统一为 ISO UTC string。
- 日期字段为本地日期字符串 `YYYY-MM-DD`。
- 时长字段明确单位，例如 `_minutes`、`_seconds`。
- 删除优先使用软删除字段 `deleted_at`。

## labels

保存状态、产物、阻塞等可扩展标签。

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

## arrival_sessions

记录用户到岗/学习位置的时间段，用于计算启动延迟。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| local_date | string | 到岗所在本地日期 |
| arrived_at | datetime | 到岗时间 |
| left_at | datetime nullable | 离开时间 |
| note | text nullable | 备注 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

派生字段：

- `startup_delay_minutes` 不必作为源字段保存。
- 计算方式：同一 arrival session 下第一条 focus session 的 `started_at - arrived_at`。

## focus_sessions

保存每轮番茄钟或自定义倒计时。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| arrival_session_id | string nullable | 关联到岗记录 |
| local_date | string | 开始时所在本地日期 |
| planned_duration_minutes | number | 计划时长 |
| actual_duration_minutes | number nullable | 实际完成时长 |
| started_at | datetime | 开始时间 |
| paused_total_seconds | number | 暂停总秒数 |
| current_pause_started_at | datetime nullable | 当前暂停开始时间，用于刷新后恢复暂停状态 |
| completed_at | datetime nullable | 完成时间 |
| canceled_at | datetime nullable | 取消时间 |
| state | string | `running`、`paused`、`completed`、`reviewed`、`canceled` |
| earned_break_minutes | number | 本轮获得休息分钟 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

规则：

- 只有 `completed` 或 `reviewed` 的记录进入学习时长统计。
- `reviewed` 表示已完成结束复盘。

## session_reviews

保存每轮结束后的复盘。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string | 关联 focus session |
| status_label_id | string | 五种状态之一或自定义状态 |
| attention_switch_count | number | 注意力切换次数 |
| product_note | text nullable | 可见产物文字 |
| blocker_note | text nullable | 阻塞补充说明 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |
| deleted_at | datetime nullable | 软删除 |

约束：

- 每个 focus session 最多一条有效 review。
- `attention_switch_count >= 0`。

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
- product 和 blocker 使用此表。
- status 单选，直接放在 `session_reviews.status_label_id`。

## break_bank_transactions

保存休息余额的增加和使用。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string nullable | 来源 focus session |
| local_date | string | 本地日期 |
| type | string | `earned`、`used`、`adjustment` |
| minutes | number | 正数表示增加，负数表示减少 |
| note | text nullable | 备注 |
| created_at | datetime | 创建时间 |

规则：

- 完成学习时写入 `earned`。
- 使用休息时写入 `used`，`minutes` 为负数。
- 提前结束休息时可以写入 `adjustment`，把未用完分钟退回余额。
- 当前余额为所有有效 transaction 的分钟数总和。

## break_sessions

保存正在进行或已结束的休息倒计时。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| focus_session_id | string nullable | 来源 focus session |
| local_date | string | 本地日期 |
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
- 休息中不计算下一轮启动延迟；休息结束后系统重新打开 arrival session。

## sleep_logs

每日睡眠记录。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 主键 |
| local_date | string | 日期，唯一 |
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
{
  "defaultFocusMinutes": 25,
  "breakEarnedPerFocusBlockMinutes": 5,
  "focusBlockMinutes": 25,
  "allowBreakCarryOver": true
}
```

## 可选缓存：daily_rollups

后续数据量变大后可以添加，不作为 MVP 必需表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| local_date | string | 日期，主键 |
| focus_minutes | number | 当日学习分钟 |
| startup_delay_minutes | number | 当日启动延迟 |
| attention_switch_count | number | 当日注意力切换 |
| earned_break_minutes | number | 当日新增休息 |
| used_break_minutes | number | 当日使用休息 |
| calculated_at | datetime | 计算时间 |

规则：

- 任何时候都必须能从源表重算。
