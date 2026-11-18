export const BASE = {
  size: 40,
  cell: 2, // 1マス＝2m
  foodPerPerson: 1,
  growthRate: 0.05,
  moraleGrowthMin: 40,
  hungerLeaveAfter: 3,
  wallRepairPerWood: 2,
  trainFoodCost: 2,
  demolishRefund: 0.5,
  nightAttackBase: 0.25,
  nightAttackPerChapter: 0.05,
  logDays: 30,
  hqHousing: 4,
} as const;

/** 壁の段階ごとの内側範囲（マス）と耐久度上限 */
export function wallBounds(stage: number): { min: number; max: number } {
  const s = Math.max(1, Math.min(3, stage));
  return { min: 12 - 4 * (s - 1), max: 27 + 4 * (s - 1) };
}
export const WALL_HP_MAX: Record<number, number> = { 1: 200, 2: 350, 3: 500 };

export const SOLDIER_NAMES = [
  'アルト', 'ベル', 'カイ', 'ディア', 'エルク', 'フィン', 'グレン', 'ハナ',
  'イオ', 'ジン', 'クロエ', 'ラグ', 'ミナ', 'ノア', 'オルガ', 'ピオ',
];
