export const TAG_TONES = [
  "blue",
  "cyan",
  "teal",
  "green",
  "amber",
  "coral",
  "rose",
  "violet",
] as const;

export type TagTone = (typeof TAG_TONES)[number];

const TAG_COLOR_HEX: Record<TagTone, string> = {
  blue: "#397BC6",
  cyan: "#2389A4",
  teal: "#278779",
  green: "#319B69",
  amber: "#B7791F",
  coral: "#C56B3C",
  rose: "#C45B72",
  violet: "#7566B8",
};

export function normalizeTagName(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("zh-CN");
}

export function tagTone(value: string): TagTone {
  let hash = 0x811c9dc5;
  for (const character of normalizeTagName(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return TAG_TONES[hash % TAG_TONES.length] ?? "blue";
}

export function tagColorHex(value: string): string {
  return TAG_COLOR_HEX[tagTone(value)];
}
