import { COMBAT as C, reactionDelay } from '../config/combat';
import type { Rng } from '../core/rng';
import {
  add, angleOf, dist, fromAngle, norm, scale, sub,
} from '../core/geometry';
import type { Vec2 } from '../state/types';
import type { CombatWorld, PartId, SoldierEntity, TitanEntity } from './types';
import { bodyR, inAttackZone, isAlive, partPos } from './titan';

const free = (s: SoldierEntity) => s.state.kind !== 'down' && s.state.kind !== 'grabbed';

/** 移動制御：目標方向の速度に、仲間との分離と巨人・障害物からの反発を足す */
export function steer(s: SoldierEntity, desired: Vec2, w: CombatWorld): Vec2 {
  let v = { ...desired };
  for (const o of w.soldiers) {
    if (o === s || !free(o)) continue;
    const d = dist(s.pos, o.pos);
    if (d < 1.5 && d > 1e-6) v = add(v, scale(norm(sub(s.pos, o.pos)), (1.5 - d) * 4));
  }
  for (const t of w.titans) {
    if (!isAlive(t)) continue;
    const d = dist(s.pos, t.pos);
    const lim = bodyR(t.size) + 1.0;
    if (d < lim && d > 1e-6) v = add(v, scale(norm(sub(s.pos, t.pos)), (lim - d) * 6));
  }
  for (const o of w.setup.stage.obstacles) {
    const d = dist(s.pos, o.pos);
    const lim = o.r + 0.9;
    if (d < lim && d > 1e-6) v = add(v, scale(norm(sub(s.pos, o.pos)), (lim - d) * 6));
  }
  const l = Math.hypot(v.x, v.z);
  return l > C.soldierSpeed ? scale(v, C.soldierSpeed / l) : v;
}

function moveTo(s: SoldierEntity, target: Vec2, stop: number, w: CombatWorld, dt: number, speedMul = 1): void {
  const to = sub(target, s.pos);
  const d = Math.hypot(to.x, to.z);
  const desired = d > stop ? scale(norm(to), C.soldierSpeed * speedMul) : { x: 0, z: 0 };
  const v = steer(s, desired, w);
  s.vel = v;
  s.pos = add(s.pos, scale(v, dt));
  if (d > 0.1) s.facing = angleOf(to);
}

/** この隊員が救出の役目を持つか */
function rescueTarget(s: SoldierEntity, w: CombatWorld): TitanEntity | null {
  const holders = w.titans.filter((t) => t.state.kind === 'holding');
  if (holders.length === 0) return null;
  for (const t of holders) {
    if (t.state.kind !== 'holding') continue;
    const victim = w.soldiers.find((x) => x.id === (t.state as { victimId: string }).victimId);
    if (!victim || victim === s) continue;
    // 救援型の隊長と、その隊員全員
    const sq = w.setup.squads.find((q) => q.squadId === s.squadId);
    if (sq?.captain?.type === 'rescuer') return t;
    // それ以外は、掴まれた仲間に一番近い隊員1人
    const cands = w.soldiers.filter((x) => free(x) && x !== victim);
    const nearest = cands.reduce<SoldierEntity | null>(
      (b, x) => (!b || dist(x.pos, victim.pos) < dist(b.pos, victim.pos) ? x : b), null);
    if (nearest === s) return t;
  }
  return null;
}

/** どの部位を狙うか */
function pickPart(s: SoldierEntity, t: TitanEntity): PartId {
  if (s.isCaptain && s.captainType === 'striker' && t.state.kind === 'kneel' && !t.parts.nape.broken) return 'nape';
  const byDist = (ids: PartId[]) => [...ids].sort((a, b) => dist(s.pos, partPos(t, a)) - dist(s.pos, partPos(t, b)));
  for (const id of byDist(['legL', 'legR'])) if (!t.parts[id].broken) return id;
  for (const id of byDist(['armL', 'armR'])) if (!t.parts[id].broken) return id;
  return 'legL';
}

/** 隊員1人を1ステップ更新 */
export function updateSoldier(s: SoldierEntity, w: CombatWorld, dt: number, rng: Rng): void {
  void rng;
  if (!free(s)) return;
  s.attackCd = Math.max(0, s.attackCd - dt);

  // 回避中はそれを続ける
  if (s.state.kind === 'evade') {
    s.state.t -= dt;
    s.vel = scale(s.state.dir, C.soldierSpeed * 1.8);
    s.pos = add(s.pos, scale(s.vel, dt));
    if (s.state.t <= 0) s.state = { kind: 'follow' };
    return;
  }

  // 2. 予告範囲の中にいる → 気づくまでの時間を進める
  let danger: TitanEntity | null = null;
  for (const t of w.titans) {
    if (t.state.kind === 'windup' && inAttackZone(t, t.state.attack, s.pos)) { danger = t; break; }
  }
  if (danger) {
    s.dangerT += dt;
    if (s.dangerT >= reactionDelay(s.level)) {
      s.state = { kind: 'evade', dir: norm(sub(s.pos, danger.pos)), t: 0.5 };
      s.dangerT = 0;
      return;
    }
  } else s.dangerT = 0;

  // 3. 撤退
  if (w.squadOrder === 'retreat') {
    s.state = { kind: 'retreat' };
    const e = w.setup.stage.exit;
    moveTo(s, { x: e.x + e.w / 2, z: e.z + e.h / 2 }, 0.5, w, dt);
    return;
  }

  // 4. 救出
  const rt = rescueTarget(s, w);
  if (rt && rt.state.kind === 'holding') {
    s.state = { kind: 'rescue', titanId: rt.id };
    attackPart(s, rt, rt.state.arm, w, dt);
    return;
  }

  // 5. 集結
  if (w.squadOrder === 'gather') { follow(s, w, dt); return; }

  // 6. 必殺中：主人公が最後に攻撃した巨人へ
  if (w.squadOrder === 'charge') {
    const t = w.titans.find((x) => x.id === w.heroLastTargetId && isAlive(x)) ?? nearestTitan(s.pos, w, Infinity);
    if (t) { attackPart(s, t, pickPart(s, t), w, dt); return; }
  }

  // 7. 主人公の近くに巨人がいれば交戦
  const near = nearestTitan(w.hero.pos, w, C.engageRange);
  if (near) { attackPart(s, near, pickPart(s, near), w, dt); return; }

  // 8. それ以外は主人公についていく
  follow(s, w, dt);
}

function nearestTitan(p: Vec2, w: CombatWorld, range: number): TitanEntity | null {
  let best: TitanEntity | null = null;
  for (const t of w.titans) {
    if (!isAlive(t)) continue;
    const d = dist(p, t.pos);
    if (d <= range && (!best || d < dist(p, best.pos))) best = t;
  }
  return best;
}

function follow(s: SoldierEntity, w: CombatWorld, dt: number): void {
  s.state = { kind: 'follow' };
  const sqIdx = Math.max(0, w.setup.squads.findIndex((q) => q.squadId === s.squadId));
  const n = w.setup.squads.length;
  const ang = w.hero.facing + Math.PI + (sqIdx - (n - 1) / 2) * 1.0 + (s.slot % 3 - 1) * 0.35;
  const r = C.followDist + Math.floor(s.slot / 3) * 1.2;
  moveTo(s, add(w.hero.pos, scale(fromAngle(ang), r)), 0.6, w, dt);
}

function attackPart(s: SoldierEntity, t: TitanEntity, part: PartId, w: CombatWorld, dt: number): void {
  if (s.state.kind !== 'rescue') s.state = { kind: 'engage', titanId: t.id, part };
  const pp = partPos(t, part);
  const d = dist(s.pos, pp);
  if (d > C.slashReach) {
    moveTo(s, pp, C.slashReach * 0.8, w, dt);
    return;
  }
  s.vel = { x: 0, z: 0 };
  s.facing = angleOf(sub(pp, s.pos));
  if (s.attackCd <= 0) {
    w.pending.push({ kind: 'soldierSlash', soldierId: s.id, titanId: t.id, part });
    s.attackCd = C.soldierAttackCd;
  }
}
