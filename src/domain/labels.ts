import type { Id, LabelRecord, LabelType } from "../types";

export function activeLabelsByType(
  labels: LabelRecord[],
  type: LabelType,
): LabelRecord[] {
  return labels
    .filter((label) => label.type === type && label.is_active && !label.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function labelNameById(labels: LabelRecord[], id: Id): string {
  return labels.find((label) => label.id === id)?.name ?? "未知标签";
}

export function getNoneBlockerLabel(labels: LabelRecord[]): LabelRecord | undefined {
  return labels.find(
    (label) =>
      label.type === "blocker" &&
      label.name === "无" &&
      label.is_active &&
      !label.deleted_at,
  );
}
