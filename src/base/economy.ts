import { BASE } from '../config/base';
import { SOLDIER_NAMES } from '../config/base';
import type { Rng } from '../core/rng';
import type { GameState, Resources, Soldier } from '../state/types';
import { BUILDING_DEFS } from './defs';
import { adjacentTerrainCount, footprint } from './grid';
import type { Building } from './types';

const floor = (v: number) => Math.floor(v + 1e-9);
const add = (o: Partial<Resources>, k: keyof Resources, v: number) => { if (v) o[k] = (o[k] ?? 0) + v; };

export const maxWorkersOf = (b: Building): number => BUILDING_DEFS[b.type].maxWorkers + (b.level - 1) * (BUILDING_DEFS[b.type].maxWorkers > 0 ? 1 : 0);
export const totalWorkers = (s: GameState): number => s.base.buildings.reduce((n, b) => n + b.workers, 0);
export const freeCivilians = (s: GameState): number => Math.max(0, s.civilians - totalWorkers(s));

const everyone = (s: GameState) => [...s.soldiers, ...s.captains];

/** 食べる人数：住民＋拠点にいる兵士・隊長（ready/injured）＋拠点にいる主人公 */
export function headcount(s: GameState): number {
  const home = everyone(s).filter((p) => p.status.kind === 'ready' || p.status.kind === 'injured').length;
  const hero = s.hero.status.kind === 'ready' || s.hero.status.kind === 'injured' ? 1 : 0;
  return s.civilians + home + hero;
}

/** 居住者：住民＋兵士・隊長（戦死者を除く） */
export function residents(s: GameState): number {
  return s.civilians + everyone(s).filter((p) => p.status.kind !== 'dead').length;
}

export function housingCap(s: GameState): number {
  let cap = BASE.hqHousing;
  for (const b of s.base.buildings) {
    if (b.type === 'house' && b.status.kind === 'active') cap += 6 + 3 * (b.level - 1);
  }
  return cap;
}

const moraleMul = (m: number) => (m < 30 ? 0.7 : m >= 70 ? 1.1 : 1);

/** 生産（昼の終わり）。状態に反映し、増減も返す */
export function produce(s: GameState): { produced: Partial<Resources>; consumed: Partial<Resources> } {
  const produced: Partial<Resources> = {};
  const consumed: Partial<Resources> = {};
  const mul = moraleMul(s.morale);
  const stock = (k: keyof Resources) => s.resources[k] - (consumed[k] ?? 0);

  for (const b of s.base.buildings) {
    if (b.status.kind !== 'active' || b.workers <= 0) continue;
    const cells = footprint(b);
    switch (b.type) {
      case 'farm': {
        const bonus = adjacentTerrainCount(s.base, cells, 'river') > 0 ? 1.5 : 1;
        add(produced, 'food', floor(b.workers * 2 * bonus * mul));
        break;
      }
      case 'lumber': {
        const bonus = 1 + Math.min(0.5, 0.1 * adjacentTerrainCount(s.base, cells, 'forest'));
        add(produced, 'wood', floor(b.workers * 2 * bonus * mul));
        break;
      }
      case 'workshop': {
        if (b.recipe === 'blades') {
          const units = Math.min(b.workers, stock('iron'));
          if (units > 0) { add(consumed, 'iron', units); add(produced, 'blades', floor(units * 4 * mul)); }
        } else if (b.recipe === 'gas') {
          const units = Math.min(b.workers, stock('crystal'));
          if (units > 0) { add(consumed, 'crystal', units); add(produced, 'gas', floor(units * 10 * mul)); }
        }
        break;
      }
      default: break;
    }
  }
  for (const k of Object.keys(consumed) as (keyof Resources)[]) s.resources[k] -= consumed[k]!;
  for (const k of Object.keys(produced) as (keyof Resources)[]) s.resources[k] += produced[k]!;
  return { produced, consumed };
}

/** 訓練（昼の終わり）：予約があれば住民1人を兵士にする */
export function train(s: GameState, rng: Rng): Soldier | null {
  const hasInstructor = s.base.buildings.some((b) => b.type === 'training' && b.status.kind === 'active' && b.workers >= 1);
  if (!hasInstructor || s.trainingQueue <= 0 || freeCivilians(s) < 1 || s.resources.food < BASE.trainFoodCost) return null;
  s.civilians -= 1;
  s.resources.food -= BASE.trainFoodCost;
  s.trainingQueue -= 1;
  let no = 1;
  for (const p of everyone(s)) { const m = /^s(\d+)$/.exec(p.id); if (m) no = Math.max(no, Number(m[1]) + 1); }
  const soldier: Soldier = { id: `s${no}`, name: rng.pick(SOLDIER_NAMES), level: 1, xp: 0, status: { kind: 'ready' } };
  s.soldiers.push(soldier);
  return soldier;
}

/** 食料（夜） */
export function feed(s: GameState): { eaten: number; shortage: number } {
  const need = headcount(s) * BASE.foodPerPerson;
  const eaten = Math.min(s.resources.food, need);
  const shortage = need - eaten;
  s.resources.food -= eaten;
  if (shortage > 0) {
    s.base.hungerStreak += 1;
    if (s.base.hungerStreak >= BASE.hungerLeaveAfter) {
      const leave = Math.min(s.civilians, Math.ceil(shortage / 3));
      s.civilians -= leave;
      trimWorkers(s);
    }
  } else s.base.hungerStreak = 0;
  return { eaten, shortage };
}

/** 住民が減ったら、配置人数が住民数を超えないように建物から外す */
export function trimWorkers(s: GameState): void {
  let over = totalWorkers(s) - s.civilians;
  for (const b of [...s.base.buildings].reverse()) {
    if (over <= 0) break;
    const cut = Math.min(b.workers, over);
    b.workers -= cut; over -= cut;
  }
}

/** 人口増加（夜）。その夜に食料不足がなく（hungerStreak=0）、士気が40以上、収容に空きがあるとき */
export function grow(s: GameState): number {
  if (s.base.hungerStreak > 0 || s.morale < BASE.moraleGrowthMin) return 0;
  const cap = housingCap(s);
  const free = cap - residents(s);
  if (free <= 0) return 0;
  const n = Math.min(free, Math.max(1, Math.floor(cap * BASE.growthRate)));
  s.civilians += n;
  return n;
}

function injuredList(s: GameState): { id: string; status: { kind: 'injured'; daysLeft: number }; hero: boolean }[] {
  const out: { id: string; status: { kind: 'injured'; daysLeft: number }; hero: boolean }[] = [];
  if (s.hero.status.kind === 'injured') out.push({ id: 'hero', status: s.hero.status, hero: true });
  for (const p of everyone(s)) if (p.status.kind === 'injured') out.push({ id: p.id, status: p.status, hero: false });
  return out;
}

/** 療養（夜）。療養が終わった人のidを返す */
export function heal(s: GameState): string[] {
  const doctors = s.base.buildings.filter((b) => b.type === 'infirmary' && b.status.kind === 'active' && b.workers >= 1);
  const bedCap = doctors.reduce((n, b) => n + 4 + 2 * (b.level - 1), 0);
  const injured = injuredList(s).sort((a, b) => Number(b.hero) - Number(a.hero) || b.status.daysLeft - a.status.daysLeft);
  const bedded = new Set(injured.slice(0, bedCap).map((p) => p.id));
  const recovered: string[] = [];
  for (const p of injured) {
    p.status.daysLeft -= bedded.has(p.id) ? 2 : 1;
    if (p.status.daysLeft <= 0) {
      recovered.push(p.id);
      bedded.delete(p.id);
      if (p.hero) s.hero.status = { kind: 'ready' };
      else {
        const person = everyone(s).find((x) => x.id === p.id)!;
        person.status = { kind: 'ready' };
      }
    }
  }
  s.base.beds = [...bedded];
  return recovered;
}

/** 士気（夜）。変化量を返す */
export function updateMorale(s: GameState, shortage: number): number {
  const before = s.morale;
  let m = s.morale;
  if (shortage > 0) m -= 10;
  if (s.resources.food >= headcount(s) * 3) m += 3;
  const res = residents(s);
  const inj = injuredList(s).length;
  if (res > 0 && inj / res >= 0.2) m -= 2;
  m += m > 50 ? -1 : m < 50 ? 1 : 0;
  s.morale = Math.max(0, Math.min(100, m));
  return s.morale - before;
}
