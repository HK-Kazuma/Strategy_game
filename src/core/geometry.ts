import type { Vec2 } from '../state/types';

export const v2 = (x = 0, z = 0): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z;
export const len = (a: Vec2): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: Vec2): Vec2 => {
  const l = len(a);
  return l < 1e-9 ? { x: 0, z: 0 } : { x: a.x / l, z: a.z / l };
};
export const fromAngle = (a: number): Vec2 => ({ x: Math.cos(a), z: Math.sin(a) });
export const angleOf = (v: Vec2): number => Math.atan2(v.z, v.x);
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 角度を (-π, π] に */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
/** b から a への最短の差（符号つき） */
export const angleDiff = (a: number, b: number): number => wrapAngle(a - b);

/** aをtargetへ最大maxStepだけ回す */
export function turnToward(a: number, target: number, maxStep: number): number {
  const d = angleDiff(target, a);
  return Math.abs(d) <= maxStep ? target : wrapAngle(a + Math.sign(d) * maxStep);
}

export const inCircle = (c: Vec2, r: number, p: Vec2): boolean => dist(c, p) <= r;

/** 扇形：中心c、向きfacing(rad)、半径radius、半角halfAngle(rad) */
export function inSector(c: Vec2, facing: number, radius: number, halfAngle: number, p: Vec2): boolean {
  const d = sub(p, c);
  const l = len(d);
  if (l > radius) return false;
  if (l < 1e-9) return true;
  return Math.abs(angleDiff(angleOf(d), facing)) <= halfAngle;
}

export interface Rect { x: number; z: number; w: number; h: number }
export const inRect = (r: Rect, p: Vec2): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.z >= r.z && p.z <= r.z + r.h;

/** 円(cpos, cr)にめり込んだ円(pos, r)を押し出した位置を返す */
export function pushOutCircle(pos: Vec2, r: number, cpos: Vec2, cr: number): Vec2 {
  const d = sub(pos, cpos);
  const l = len(d);
  const min = r + cr;
  if (l >= min) return pos;
  const n = l < 1e-9 ? { x: 1, z: 0 } : scale(d, 1 / l);
  return add(cpos, scale(n, min));
}
