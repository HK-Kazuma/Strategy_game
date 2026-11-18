import { BASE, WALL_HP_MAX, wallBounds } from '../config/base';
import { newBuilding } from '../base/actions';
import { canPlace, footprint, adjacentTerrainCount } from '../base/grid';
import { generateTerrain } from '../base/terrain';
import type { BuildingType } from '../base/types';
import { emptyToday } from '../base/day';
import type { Captain, GameState, Soldier } from './types';

const soldier = (i: number): Soldier => ({ id: `s${i}`, name: ['アルト', 'ベル', 'カイ', 'ディア'][i - 1], level: 1, xp: 0, status: { kind: 'ready' } });
const captain = (id: string, name: string, type: Captain['type']): Captain => ({ id, name, type, level: 2, xp: 0, status: { kind: 'ready' } });

/** 司令部の近くで置ける場所を探して即時に建てる */
function autoPlace(s: GameState, type: BuildingType, prefer?: 'river'): void {
  const wb = wallBounds(1);
  const spots: { x: number; z: number; d: number }[] = [];
  for (let z = wb.min; z <= wb.max; z++) for (let x = wb.min; x <= wb.max; x++) spots.push({ x, z, d: Math.hypot(x - 19.5, z - 19.5) });
  spots.sort((a, b) => a.d - b.d);
  const ok = (p: { x: number; z: number }) => canPlace(s.base, type, p.x, p.z, 0).ok;
  let pick = prefer
    ? spots.find((p) => ok(p) && adjacentTerrainCount(s.base, footprint({ type, x: p.x, z: p.z, rot: 0 }), prefer) > 0)
    : undefined;
  pick ??= spots.find(ok);
  if (!pick) throw new Error(`初期配置できません: ${type}`);
  newBuilding(s, type, pick.x, pick.z, 0, true);
}

export function createNewGame(seed: number): GameState {
  const s: GameState = {
    version: 1, seed, day: 1, phase: 'morning', chapter: 1,
    resources: { wood: 80, stone: 20, food: 60, ironOre: 0, crystal: 5, iron: 10, gas: 100, blades: 24 },
    civilians: 10, morale: 60,
    base: {
      size: BASE.size, terrain: generateTerrain(seed),
      wall: { stage: 1, hp: WALL_HP_MAX[1], hpMax: WALL_HP_MAX[1] },
      buildings: [], nextBuildingNo: 1, hungerStreak: 0, beds: [],
      today: emptyToday({ civilians: 10, morale: 60 }),
    },
    captains: [captain('c1', 'ガルド', 'holder'), captain('c2', 'リナ', 'rescuer')],
    soldiers: [1, 2, 3, 4].map(soldier),
    squads: [
      { id: 'sq1', captainId: 'c1', soldierIds: ['s1', 's2'] },
      { id: 'sq2', captainId: 'c2', soldierIds: ['s3', 's4'] },
    ],
    hero: { rank: 'private', merit: 0, gear: { blade: 1, tank: 1, anchor: 1 }, status: { kind: 'ready' } },
    memorial: [], expedition: null, raidWarning: null, log: [],
    trainingQueue: 0, lastRaidDay: -99,
    chapterState: { bossDefeated: false, wallWork: 0 },
  };
  newBuilding(s, 'hq', 18, 18, 0, true);
  autoPlace(s, 'farm', 'river');
  autoPlace(s, 'lumber');
  autoPlace(s, 'house');
  autoPlace(s, 'house');
  // 畑と伐採所に初期の労働者を置く
  for (const b of s.base.buildings) if (b.type === 'farm' || b.type === 'lumber') b.workers = 3;
  return s;
}
