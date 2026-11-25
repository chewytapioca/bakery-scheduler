/** Sprite URL resolver. The standalone preview build injects data URIs via globalThis. */
export const sprite = (name: string): string =>
  (globalThis as unknown as { __BAKERY_SPRITES?: Record<string, string> }).__BAKERY_SPRITES?.[name] ?? `/sprites/${name}.webp`;
