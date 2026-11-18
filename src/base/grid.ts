import { BASE, wallBounds } from '../config/base';
import { BUILDING_DEFS } from './defs';
import type { BaseState, BuildingType, PlaceCheck, Terrain } from './types';

type Cell = { x: number; z: number };

export function footprint(b: { type: BuildingType; x: number; z: number; rot: 0 | 1 }): Cell[] {
  const d = BUILDING_DEFS[b.type];
  const w = b.rot === 1 ? d.h : d.w;
  const h = b.rot === 1 ? d.w : d.h;
  const out: Cell[] = [];
  for (let dz = 0; dz < h; dz++) for (let dx = 0; dx < w; dx++) out.push({ x: b.x + dx, z: b.z + dz });
  return out;
}

export const terrainAt = (base: BaseState, x: number, z: number): Terrain | null =>
  x < 0 || z < 0 || x >= BASE.size || z >= BASE.size ? null : base.terrain[z * BASE.size + x];

/** マスごとの建物id */
export function occupancy(base: BaseState): (string | null)[] {
  const occ: (string | null)[] = new Array(BASE.size * BASE.size).fill(null);
  for (const b of base.buildings) {
    for (const c of footprint(b)) {
      if (c.x >= 0 && c.z >= 0 && c.x < BASE.size && c.z < BASE.size) occ[c.z * BASE.size + c.x] = b.id;
    }
  }
  return occ;
}

/** footprintに上下左右で接し、footprintに含まれないマスのうち、地形tのものを重複なしで数える */
export function adjacentTerrainCount(base: BaseState, cells: Cell[], t: Terrain): number {
  const own = new Set(cells.map((c) => `${c.x},${c.z}`));
  const seen = new Set<string>();
  let n = 0;
  for (const c of cells) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, z = c.z + dz;
      const key = `${x},${z}`;
      if (own.has(key) || seen.has(key)) continue;
      seen.add(key);
      if (terrainAt(base, x, z) === t) n++;
    }
  }
  return n;
}

export function canPlace(
  base: BaseState, type: BuildingType, x: number, z: number, rot: 0 | 1, ignoreId?: string,
): PlaceCheck {
  const def = BUILDING_DEFS[type];
  if (def.unique && base.buildings.some((b) => b.type === type && b.id !== ignoreId)) return { ok: false, reason: 'unique' };

  const cells = footprint({ type, x, z, rot });
  const wb = wallBounds(base.wall.stage);
  if (cells.some((c) => c.x < wb.min || c.x > wb.max || c.z < wb.min || c.z > wb.max)) return { ok: false, reason: 'outsideWall' };
  if (cells.some((c) => terrainAt(base, c.x, c.z) !== 'grass')) return { ok: false, reason: 'terrain' };

  const occ = occupancy(base);
  if (cells.some((c) => { const o = occ[c.z * BASE.size + c.x]; return o !== null && o !== ignoreId; })) return { ok: false, reason: 'overlap' };

  if (def.needsAdjacent && adjacentTerrainCount(base, cells, def.needsAdjacent) < 1) return { ok: false, reason: 'needsAdjacent' };
  return { ok: true };
}

export const REASON_TEXT: Record<string, string> = {
  outsideWall: '壁の外には建てられません',
  overlap: '他の建物と重なっています',
  terrain: '草地にしか建てられません',
  needsAdjacent: '必要な地形に隣接していません',
  unique: 'この建物は1つしか建てられません',
};
