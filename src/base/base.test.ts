import { describe, expect, it } from 'vitest';
import { createNewGame } from '../state/initial';
import { createRng } from '../core/rng';
import { canPlace, adjacentTerrainCount, footprint } from './grid';
import { feed, grow, heal, produce, headcount } from './economy';
import { advancePhase } from './day';
import { newBuilding, placeBuilding, demolish, levelUp, setWorkers } from './actions';
import type { GameState } from '../state/types';
import type { Building, Terrain } from './types';

const game = (seed = 1): GameState => createNewGame(seed);
const of = (s: GameState, type: string) => s.base.buildings.find((b) => b.type === type)!;

/** 川に接するよう、地形を手で整えた小さな状態 */
function flat(): GameState {
  const s = game();
  s.base.buildings = [];
  s.base.terrain = s.base.terrain.map((): Terrain => 'grass');
  s.base.nextBuildingNo = 1;
  return s;
}

describe('地形と初期状態', () => {
  it('壁の段階1の内側に川と森がある（複数シード）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = game(seed);
      const kinds = new Set<Terrain>();
      for (let z = 12; z <= 27; z++) for (let x = 12; x <= 27; x++) kinds.add(s.base.terrain[z * 40 + x]);
      expect(kinds.has('river')).toBe(true);
      expect(kinds.has('forest')).toBe(true);
    }
  });
  it('初期状態：畑は川沿い、伐採所は森沿い', () => {
    const s = game();
    expect(adjacentTerrainCount(s.base, footprint(of(s, 'farm')), 'river')).toBeGreaterThan(0);
    expect(adjacentTerrainCount(s.base, footprint(of(s, 'lumber')), 'forest')).toBeGreaterThan(0);
  });
});

describe('canPlace', () => {
  it('壁の外 → outsideWall', () => {
    expect(canPlace(flat().base, 'house', 5, 20, 0)).toEqual({ ok: false, reason: 'outsideWall' });
  });
  it('重なる → overlap', () => {
    const s = flat();
    newBuilding(s, 'farm', 20, 20, 0);
    expect(canPlace(s.base, 'house', 21, 21, 0)).toEqual({ ok: false, reason: 'overlap' });
  });
  it('森から離れた伐採所 → needsAdjacent', () => {
    expect(canPlace(flat().base, 'lumber', 15, 15, 0)).toEqual({ ok: false, reason: 'needsAdjacent' });
  });
  it('司令部2つ目 → unique', () => {
    const s = flat();
    newBuilding(s, 'hq', 18, 18, 0);
    expect(canPlace(s.base, 'hq', 24, 24, 0)).toEqual({ ok: false, reason: 'unique' });
  });
  it('移動中の建物が元の位置と重なっても ok（ignoreId）', () => {
    const s = flat();
    const b = newBuilding(s, 'house', 20, 20, 0);
    expect(canPlace(s.base, 'house', 21, 20, 0, b.id)).toEqual({ ok: true });
    expect(canPlace(s.base, 'house', 21, 20, 0).ok).toBe(false);
  });
  it('森・川には建てられない → terrain', () => {
    const s = flat();
    s.base.terrain[20 * 40 + 20] = 'rock';
    expect(canPlace(s.base, 'house', 20, 20, 0)).toEqual({ ok: false, reason: 'terrain' });
  });
});

describe('economy', () => {
  it('produce：川沿いの畑、労働者2、士気50 → 食料 +6', () => {
    const s = flat();
    s.base.terrain[20 * 40 + 22] = 'river';
    const f = newBuilding(s, 'farm', 20, 20, 0, true);
    f.workers = 2; s.civilians = 10; s.morale = 50;
    const food = s.resources.food;
    produce(s);
    expect(s.resources.food - food).toBe(6);
  });
  it('produce：工房（刃）、労働者2、鉄の在庫1 → 刃+4、鉄-1', () => {
    const s = flat();
    const w = newBuilding(s, 'workshop', 20, 20, 0, true);
    w.workers = 2; w.recipe = 'blades'; s.civilians = 10;
    s.resources.iron = 1; const blades = s.resources.blades;
    produce(s);
    expect(s.resources.blades - blades).toBe(4);
    expect(s.resources.iron).toBe(0);
  });
  it('feed：食料5、人数8 → 食料0、shortage 3、hungerStreak +1', () => {
    const s = flat();
    s.civilians = 8; s.soldiers = []; s.captains = []; s.hero.status = { kind: 'away' };
    s.resources.food = 5;
    expect(headcount(s)).toBe(8);
    const r = feed(s);
    expect(s.resources.food).toBe(0);
    expect(r.shortage).toBe(3);
    expect(s.base.hungerStreak).toBe(1);
  });
  it('feed：hungerStreak 2 でさらに不足3 → 住民 -1', () => {
    const s = flat();
    s.civilians = 8; s.soldiers = []; s.captains = []; s.hero.status = { kind: 'away' };
    s.resources.food = 5; s.base.hungerStreak = 2;
    feed(s);
    expect(s.civilians).toBe(7);
  });
  it('grow：収容上限40、居住者30、士気60 → +2', () => {
    const s = flat();
    for (let i = 0; i < 6; i++) newBuilding(s, 'house', 14 + (i % 3) * 3, 14 + Math.floor(i / 3) * 3, 0, true);
    s.soldiers = []; s.captains = []; s.civilians = 30; s.morale = 60; s.base.hungerStreak = 0;
    expect(grow(s)).toBe(2);
    expect(s.civilians).toBe(32);
  });
  it('heal：ベッドの daysLeft 3 を1回 → 1', () => {
    const s = flat();
    const inf = newBuilding(s, 'infirmary', 20, 20, 0, true) as Building;
    inf.workers = 1; s.civilians = 5;
    s.soldiers[0].status = { kind: 'injured', daysLeft: 3 };
    heal(s);
    expect(s.soldiers[0].status).toEqual({ kind: 'injured', daysLeft: 1 });
  });
  it('heal：医師がいなければ1日1日分', () => {
    const s = flat();
    s.soldiers[0].status = { kind: 'injured', daysLeft: 3 };
    heal(s);
    expect(s.soldiers[0].status).toEqual({ kind: 'injured', daysLeft: 2 });
  });
});

describe('day', () => {
  it('朝から3回で day+1、日報1件、phase morning', () => {
    const s = game();
    const rng = createRng(5);
    const d = s.day;
    advancePhase(s, rng); advancePhase(s, rng);
    const r = advancePhase(s, rng);
    expect(s.day).toBe(d + 1);
    expect(s.phase).toBe('morning');
    expect(s.log).toHaveLength(1);
    expect(r.report).toBeDefined();
  });
  it('10日進めても例外なく、状態が壊れない', () => {
    const s = game(3);
    const rng = createRng(9);
    for (let i = 0; i < 30; i++) advancePhase(s, rng);
    expect(s.day).toBe(11);
    expect(s.civilians).toBeGreaterThanOrEqual(0);
    expect(s.morale).toBeGreaterThanOrEqual(0);
    expect(s.log).toHaveLength(10);
  });
  it('食料が尽きると士気が下がり、続くと住民が減る', () => {
    const s = game();
    const rng = createRng(2);
    s.resources.food = 0;
    for (const b of s.base.buildings) b.workers = 0;
    const c0 = s.civilians;
    for (let i = 0; i < 12; i++) advancePhase(s, rng);
    expect(s.morale).toBeLessThan(60);
    expect(s.civilians).toBeLessThan(c0);
  });
});

describe('actions', () => {
  it('建築→資源が減り建設中になる。夜明けまで2回進めると完成', () => {
    const s = game();
    const rng = createRng(1);
    const b = (() => {
      for (let z = 12; z < 27; z++) for (let x = 12; x < 27; x++) {
        if (placeBuilding(s, 'house', x, z, 0).ok) return s.base.buildings[s.base.buildings.length - 1];
      }
      throw new Error('置けない');
    })();
    expect(s.resources.wood).toBe(60);
    expect(b.status.kind).toBe('constructing');
    advancePhase(s, rng); advancePhase(s, rng);
    expect(b.status.kind).toBe('active');
  });
  it('解体で50%戻る・司令部は解体できない', () => {
    const s = game();
    const h = of(s, 'house');
    const wood = s.resources.wood;
    expect(demolish(s, h.id).ok).toBe(true);
    expect(s.resources.wood).toBe(wood + 10);
    expect(demolish(s, of(s, 'hq').id).ok).toBe(false);
  });
  it('司令部のレベルを超えて強化できない', () => {
    const s = game();
    s.resources.wood = 999;
    expect(levelUp(s, of(s, 'farm').id).ok).toBe(false); // 司令部Lv1のまま
    expect(levelUp(s, of(s, 'hq').id).ok).toBe(true);
    const farm = of(s, 'farm');
    expect(levelUp(s, farm.id).ok).toBe(true);
    farm.status = { kind: 'active' };
    expect(levelUp(s, farm.id).ok).toBe(false); // 司令部Lv2を超えない
  });
  it('配置は空いている住民の範囲内', () => {
    const s = game();
    const farm = of(s, 'farm');
    expect(setWorkers(s, farm.id, 3).ok).toBe(true);
    s.civilians = 6; // 畑3＋伐採所3で埋まっている
    const w = newBuilding(s, 'workshop', 22, 14, 0, true);
    expect(setWorkers(s, w.id, 1).ok).toBe(false);
  });
});
