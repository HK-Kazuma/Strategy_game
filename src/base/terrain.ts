import { createRng } from '../core/rng';
import { BASE, wallBounds } from '../config/base';
import type { Terrain } from './types';

const N = BASE.size;

/** シードから地形を作る：斜めの川1本、森3〜5塊、岩場2〜3塊。壁の段階1の内側に川と森が入る */
export function generateTerrain(seed: number): Terrain[] {
  const rng = createRng((seed ^ 0x51ed270b) >>> 0);
  const t: Terrain[] = new Array(N * N).fill('grass');
  const at = (x: number, z: number) => z * N + x;
  const inMap = (x: number, z: number) => x >= 0 && z >= 0 && x < N && z < N;

  // 川：x - z = k の斜め帯（幅2）。少しうねらせる
  const k = rng.int(5, 8) * (rng.chance(0.5) ? 1 : -1);
  const ph = rng.range(0, 6);
  for (let z = 0; z < N; z++) {
    const kk = k + Math.round(1.5 * Math.sin(z / 4 + ph));
    for (const d of [0, 1]) {
      const x = z + kk + d;
      if (inMap(x, z)) t[at(x, z)] = 'river';
    }
  }

  const blob = (cx: number, cz: number, r: number, kind: Terrain) => {
    for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        if (!inMap(x, z) || t[at(x, z)] !== 'grass') continue;
        if (Math.hypot(x - cx, z - cz) <= r + rng.range(-0.5, 0.5)) t[at(x, z)] = kind;
      }
    }
  };
  const nearRiver = (cx: number, cz: number, r: number) => {
    for (let z = cz - r; z <= cz + r; z++) for (let x = cx - r; x <= cx + r; x++) if (inMap(x, z) && t[at(x, z)] === 'river') return true;
    return false;
  };

  // 壁の段階1の内側に必ず森を置く（司令部と川から離す）
  const w1 = wallBounds(1);
  let placed = false;
  for (let i = 0; i < 80 && !placed; i++) {
    const cx = rng.int(w1.min + 2, w1.max - 2), cz = rng.int(w1.min + 2, w1.max - 2);
    if (Math.hypot(cx - 19, cz - 19) < 6 || nearRiver(cx, cz, 4)) continue;
    blob(cx, cz, rng.range(2, 2.8), 'forest');
    placed = true;
  }
  if (!placed) blob(w1.min + 2, w1.min + 2, 2.2, 'forest');

  // 残りの森と岩場（司令部の周りは避ける）
  const extra = (kind: Terrain, count: number, rMin: number, rMax: number) => {
    for (let n = 0; n < count; n++) {
      for (let i = 0; i < 30; i++) {
        const cx = rng.int(2, N - 3), cz = rng.int(2, N - 3);
        if (Math.hypot(cx - 19, cz - 19) < 6) continue;
        blob(cx, cz, rng.range(rMin, rMax), kind);
        break;
      }
    }
  };
  extra('forest', rng.int(2, 4), 2, 3.5);
  extra('rock', rng.int(2, 3), 1.5, 2.5);

  // 司令部の周りは必ず草地
  for (let z = 17; z <= 21; z++) for (let x = 17; x <= 21; x++) t[at(x, z)] = 'grass';
  return t;
}
