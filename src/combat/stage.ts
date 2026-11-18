import { createRng } from '../core/rng';
import { dist } from '../core/geometry';
import type { Captain, Soldier } from '../state/types';
import type { CombatSetup, StageDef } from './types';

/** 森のステージ：40m×40m、木が8本 */
export function createForestStage(seed: number): StageDef {
  const rng = createRng(seed ^ 0x9e3779b9);
  const w = 40, h = 40;
  const spawn = { x: 5, z: 20 };
  const trees: { x: number; z: number }[] = [];
  let guard = 0;
  while (trees.length < 8 && guard++ < 500) {
    const p = { x: rng.range(4, w - 4), z: rng.range(4, h - 4) };
    if (dist(p, spawn) < 5) continue;
    if (p.x > 34 && p.z > 15 && p.z < 25) continue; // 出口の前は空ける
    if (trees.some((t) => dist(t, p) < 6)) continue;
    trees.push({ x: p.x, z: p.z });
  }
  return {
    w, h, terrain: 'forest',
    anchors: trees.map((t, i) => ({ id: `tree${i}`, pos: { x: t.x, z: t.z } })),
    obstacles: trees.map((t) => ({ pos: { x: t.x, z: t.z }, r: 0.6 })),
    heroSpawn: spawn,
    exit: { x: 37, z: 17, w: 3, h: 6 },
  };
}

const NAMES = ['アルト', 'ベル', 'カイ', 'ディア', 'エルク', 'フィン', 'グレン', 'ハナ'];

/** P1の動作確認用の初期セットアップ：通常種2体＋奇行種1体 */
export function createPrototypeSetup(seed = 1): CombatSetup {
  const mk = (i: number, level = 1): Soldier => ({
    id: `s${i}`, name: NAMES[i % NAMES.length], level, xp: 0, status: { kind: 'ready' },
  });
  const cap = (id: string, type: Captain['type'], name: string): Captain => ({
    id, name, level: 2, xp: 0, status: { kind: 'ready' }, type,
  });
  return {
    seed,
    stage: createForestStage(seed),
    objective: 'annihilate',
    hero: { gear: { blade: 1, tank: 1, anchor: 1 }, gas: 100, blades: 6 },
    squads: [
      { squadId: 'sq1', captain: cap('c1', 'holder', 'ガルド'), soldiers: [mk(1), mk(2)] },
      { squadId: 'sq2', captain: cap('c2', 'rescuer', 'リナ'), soldiers: [mk(3), mk(4)] },
    ],
    titans: [
      { kind: 'normal', pos: { x: 27, z: 10 }, size: 8 },
      { kind: 'normal', pos: { x: 29, z: 30 }, size: 10 },
      { kind: 'abnormal', pos: { x: 20, z: 36 }, size: 6 },
    ],
  };
}
