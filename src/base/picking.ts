import type * as THREE from 'three';
import { BASE } from '../config/base';
import { groundPoint } from '../render/renderer';

/** マウス（NDC）→ マス座標。マップの外は null */
export function cellAt(camera: THREE.OrthographicCamera, ndcX: number, ndcY: number): { x: number; z: number } | null {
  const p = groundPoint(camera, ndcX, ndcY);
  if (!p) return null;
  const x = Math.floor(p.x / BASE.cell), z = Math.floor(p.z / BASE.cell);
  return x < 0 || z < 0 || x >= BASE.size || z >= BASE.size ? null : { x, z };
}
