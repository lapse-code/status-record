import type { AppSettingRecord, LabelRecord } from "./types";
import { nowIso } from "./domain/time";

interface DefaultLabelSeed {
  id: string;
  type: LabelRecord["type"];
  name: string;
  color: string;
  sort_order: number;
}

export const defaultLabelSeeds: DefaultLabelSeed[] = [
  {
    id: "status-completed",
    type: "session_status",
    name: "完成",
    color: "#2f855a",
    sort_order: 10,
  },
  {
    id: "status-partial",
    type: "session_status",
    name: "部分完成",
    color: "#b7791f",
    sort_order: 20,
  },
  {
    id: "status-interrupted",
    type: "session_status",
    name: "被打断",
    color: "#c05621",
    sort_order: 30,
  },
  {
    id: "status-stuck",
    type: "session_status",
    name: "卡住",
    color: "#805ad5",
    sort_order: 40,
  },
  {
    id: "status-shifted",
    type: "session_status",
    name: "放弃/转移",
    color: "#718096",
    sort_order: 50,
  },
  {
    id: "blocker-none",
    type: "blocker",
    name: "无",
    color: "#2f855a",
    sort_order: 10,
  },
  {
    id: "blocker-unclear",
    type: "blocker",
    name: "不清楚",
    color: "#3182ce",
    sort_order: 20,
  },
  {
    id: "blocker-hard",
    type: "blocker",
    name: "太难",
    color: "#805ad5",
    sort_order: 30,
  },
  {
    id: "blocker-boring",
    type: "blocker",
    name: "太无聊",
    color: "#b7791f",
    sort_order: 40,
  },
  {
    id: "blocker-fear",
    type: "blocker",
    name: "害怕做差",
    color: "#d53f8c",
    sort_order: 50,
  },
  {
    id: "blocker-tired",
    type: "blocker",
    name: "太累",
    color: "#718096",
    sort_order: 60,
  },
  {
    id: "blocker-interrupted",
    type: "blocker",
    name: "被打断",
    color: "#c05621",
    sort_order: 70,
  },
  {
    id: "product-note",
    type: "product",
    name: "笔记",
    color: "#2b6cb0",
    sort_order: 10,
  },
  {
    id: "product-code",
    type: "product",
    name: "代码",
    color: "#2f855a",
    sort_order: 20,
  },
  {
    id: "product-file",
    type: "product",
    name: "文件",
    color: "#805ad5",
    sort_order: 30,
  },
  {
    id: "product-audio",
    type: "product",
    name: "录音",
    color: "#dd6b20",
    sort_order: 40,
  },
  {
    id: "product-ppt",
    type: "product",
    name: "PPT",
    color: "#c53030",
    sort_order: 50,
  },
  {
    id: "product-excerpt",
    type: "product",
    name: "阅读摘录",
    color: "#319795",
    sort_order: 60,
  },
  {
    id: "product-exercise",
    type: "product",
    name: "练习题",
    color: "#b7791f",
    sort_order: 70,
  },
  {
    id: "product-other",
    type: "product",
    name: "其他",
    color: "#718096",
    sort_order: 80,
  },
];

export function createDefaultLabel(seed: DefaultLabelSeed): LabelRecord {
  const timestamp = nowIso();
  return {
    ...seed,
    is_default: true,
    is_active: true,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export const defaultSettings: AppSettingRecord[] = [
  {
    key: "timer",
    value_json: JSON.stringify({
      defaultFocusMinutes: 25,
      focusBlockMinutes: 25,
      breakEarnedPerFocusBlockMinutes: 5,
      allowBreakCarryOver: true,
    }),
    updated_at: nowIso(),
  },
  {
    key: "timelineColors",
    value_json: JSON.stringify({
      empty: "#f0efed",
      startup_delay: "#e05c54",
      break: "#63b3ed",
      focus: "#2f855a",
      blocked: "#d49a24",
    }),
    updated_at: nowIso(),
  },
];
