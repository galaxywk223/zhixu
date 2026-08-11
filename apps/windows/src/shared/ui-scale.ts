import { uiScaleSchema, type UiScale } from "@zhixu/contracts";

export const DEFAULT_UI_SCALE: UiScale = 100;
export const UI_SCALE_STEPS: readonly UiScale[] = [80, 90, 100, 110, 125, 150];

export function normalizeUiScale(value: unknown): UiScale {
  const parsed = uiScaleSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_UI_SCALE;
}

export function stepUiScale(current: unknown, direction: -1 | 1): UiScale {
  const normalized = normalizeUiScale(current);
  const currentIndex = UI_SCALE_STEPS.indexOf(normalized);
  const nextIndex = Math.max(
    0,
    Math.min(UI_SCALE_STEPS.length - 1, currentIndex + direction),
  );
  return UI_SCALE_STEPS[nextIndex] ?? DEFAULT_UI_SCALE;
}
