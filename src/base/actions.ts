import { BASE, WALL_HP_MAX } from '../config/base';
import type { GameState, Resources } from '../state/types';
import { BUILDING_DEFS } from './defs';
import { freeCivilians, maxWorkersOf } from './economy';
import { canPlace } from './grid';
import type { Building, BuildingType, PlaceCheck, RecipeId } from './types';

export type ActionResult = { ok: true } | { ok: false; error: string };
const fail = (error: string): ActionResult => ({ ok: false, error });
const OK: ActionResult = { ok: true };

export const canAfford = (s: GameState, cost: Partial<Resources>): boolean =>
  (Object.keys(cost) as (keyof Resources)[]).every((k) => s.resources[k] >= cost[k]!);
const pay = (s: GameState, cost: Partial<Resources>) => { for (const k of Object.keys(cost) as (keyof Resources)[]) s.resources[k] -= cost[k]!; };
const refund = (s: GameState, cost: Partial<Resources>, rate: number) => {
  for (const k of Object.keys(cost) as (keyof Resources)[]) s.resources[k] += Math.floor(cost[k]! * rate);
};
const find = (s: GameState, id: string) => s.base.buildings.find((b) => b.id === id);
const morning = (s: GameState) => s.phase === 'morning';

export function newBuilding(s: GameState, type: BuildingType, x: number, z: number, rot: 0 | 1, instant = false): Building {
  const def = BUILDING_DEFS[type];
  const b: Building = {
    id: `b${s.base.nextBuildingNo++}`, type, x, z, rot, level: 1, workers: 0,
    recipe: type === 'workshop' ? 'blades' : null,
    status: instant || def.buildDays === 0 ? { kind: 'active' } : { kind: 'constructing', daysLeft: def.buildDays },
    hp: 100, hpMax: 100,
  };
  s.base.buildings.push(b);
  return b;
}

export function placeBuilding(s: GameState, type: BuildingType, x: number, z: number, rot: 0 | 1): ActionResult {
  if (!morning(s)) return fail('朝にしか建てられません');
  const chk: PlaceCheck = canPlace(s.base, type, x, z, rot);
  if (!chk.ok) return fail(chk.reason);
  const def = BUILDING_DEFS[type];
  if (!canAfford(s, def.cost)) return fail('資源が足りません');
  pay(s, def.cost);
  newBuilding(s, type, x, z, rot);
  return OK;
}

export function moveBuilding(s: GameState, id: string, x: number, z: number, rot: 0 | 1): ActionResult {
  if (!morning(s)) return fail('朝にしか動かせません');
  const b = find(s, id);
  if (!b) return fail('建物がありません');
  const chk = canPlace(s.base, b.type, x, z, rot, id);
  if (!chk.ok) return fail(chk.reason);
  b.x = x; b.z = z; b.rot = rot;
  return OK;
}

export function demolish(s: GameState, id: string): ActionResult {
  if (!morning(s)) return fail('朝にしか解体できません');
  const b = find(s, id);
  if (!b) return fail('建物がありません');
  if (b.type === 'hq') return fail('司令部は解体できません');
  refund(s, BUILDING_DEFS[b.type].cost, BASE.demolishRefund);
  s.base.buildings = s.base.buildings.filter((x) => x.id !== id);
  return OK;
}

export function levelUpCost(s: GameState, b: Building): Partial<Resources> {
  if (b.type === 'hq') return { wood: 60 * b.level, iron: 10 * b.level };
  const cost: Partial<Resources> = {};
  const base = BUILDING_DEFS[b.type].cost;
  for (const k of Object.keys(base) as (keyof Resources)[]) cost[k] = base[k]! * (b.level + 1);
  return cost;
}

export function levelUp(s: GameState, id: string): ActionResult {
  if (!morning(s)) return fail('朝にしか強化できません');
  const b = find(s, id);
  if (!b) return fail('建物がありません');
  if (b.status.kind !== 'active') return fail('建設中・損傷中は強化できません');
  const hq = s.base.buildings.find((x) => x.type === 'hq');
  if (b.type !== 'hq' && hq && b.level >= hq.level) return fail('司令部のレベルを超えられません');
  const cost = levelUpCost(s, b);
  if (!canAfford(s, cost)) return fail('資源が足りません');
  pay(s, cost);
  b.level += 1;
  b.status = { kind: 'constructing', daysLeft: b.type === 'hq' ? 2 : 1 };
  return OK;
}

/** 労働者を n 人にする（空いている住民の範囲内） */
export function setWorkers(s: GameState, id: string, n: number): ActionResult {
  if (!morning(s)) return fail('朝にしか配置できません');
  const b = find(s, id);
  if (!b) return fail('建物がありません');
  const target = Math.max(0, Math.min(n, maxWorkersOf(b)));
  const delta = target - b.workers;
  if (delta > freeCivilians(s)) return fail('空いている住民がいません');
  b.workers = target;
  return OK;
}

export function setRecipe(s: GameState, id: string, recipe: RecipeId): ActionResult {
  const b = find(s, id);
  if (!b || b.type !== 'workshop') return fail('工房ではありません');
  b.recipe = recipe;
  return OK;
}

export function repairWall(s: GameState, wood: number): ActionResult {
  if (!morning(s)) return fail('朝にしか修理できません');
  const w = s.base.wall;
  const need = Math.ceil((w.hpMax - w.hp) / BASE.wallRepairPerWood);
  const use = Math.min(wood, s.resources.wood, need);
  if (use <= 0) return fail('修理する必要がないか、木材がありません');
  s.resources.wood -= use;
  w.hp = Math.min(w.hpMax, w.hp + use * BASE.wallRepairPerWood);
  return OK;
}

export function reserveTraining(s: GameState, delta: number): void {
  s.trainingQueue = Math.max(0, s.trainingQueue + delta);
}

export { WALL_HP_MAX };
