import { COMBAT as C } from '../config/combat';
import type { InputState } from '../core/input';
import {
  add, angleOf, clamp, dist, fromAngle, norm, scale, sub,
} from '../core/geometry';
import type { Vec2 } from '../state/types';
import type { AnchorTarget, CombatWorld, HeroEntity } from './types';
import { isInNapeZone, partPos, bodyR, isAlive } from './titan';

export function createHero(w: { gas: number; blades: number }, spawn: Vec2): HeroEntity {
  const hasBlade = w.blades > 0;
  return {
    pos: { ...spawn }, vel: { x: 0, z: 0 }, facing: 0,
    hp: C.heroHp, gas: w.gas,
    bladeDur: hasBlade ? C.bladeDurMax : 0,
    spareBlades: Math.max(0, w.blades - 1),
    superCharge: 0, attackCd: 0, dodgeCd: 0, anchorCd: 0,
    state: { kind: 'ground' },
  };
}

export const stun = (h: HeroEntity, sec: number): void => { h.state = { kind: 'stunned', t: sec }; };

/** マウス位置から、アンカーを撃ち込む先を決める */
export function findAnchorTarget(h: HeroEntity, cursor: Vec2, w: CombatWorld): AnchorTarget | null {
  const range = C.anchorRange + (w.setup.hero.gear.anchor - 1);
  // 1. マウスに近い巨人（胴体の円から anchorSnap 以内）
  let best: { id: string; d: number } | null = null;
  for (const t of w.titans) {
    if (!isAlive(t)) continue;
    const dc = dist(cursor, t.pos);
    if (dc > bodyR(t.size) + C.anchorSnap) continue;
    if (dist(h.pos, t.pos) > range) continue;
    if (!best || dc < best.d) best = { id: t.id, d: dc };
  }
  if (best) {
    const t = w.titans.find((x) => x.id === best!.id)!;
    return { kind: 'titan', titanId: t.id, nape: isInNapeZone(h.pos, t) };
  }
  // 2. 一番近い支点
  let bp: { pos: Vec2; d: number } | null = null;
  for (const a of w.setup.stage.anchors) {
    const dc = dist(cursor, a.pos);
    if (dc > C.anchorSnap) continue;
    if (!bp || dc < bp.d) bp = { pos: a.pos, d: dc };
  }
  if (bp && dist(h.pos, bp.pos) <= range) return { kind: 'point', pos: { ...bp.pos } };
  return null;
}

function reelDestination(h: HeroEntity, target: AnchorTarget, w: CombatWorld): Vec2 | null {
  if (target.kind === 'point') return target.pos;
  const t = w.titans.find((x) => x.id === target.titanId);
  if (!t || !isAlive(t)) return null;
  return target.nape ? partPos(t, 'nape') : t.pos;
}

/** 主人公1人を1ステップ更新。攻撃の意図は w.pending に積む */
export function updateHero(h: HeroEntity, input: InputState, w: CombatWorld, dt: number): void {
  h.attackCd = Math.max(0, h.attackCd - dt);
  h.dodgeCd = Math.max(0, h.dodgeCd - dt);
  h.anchorCd = Math.max(0, h.anchorCd - dt);

  if (h.hp <= 0 && h.state.kind !== 'down') { h.hp = 0; h.state = { kind: 'down' }; }
  if (h.state.kind === 'down') return;

  if (h.state.kind !== 'mounted') h.facing = angleOf(sub(input.cursor, h.pos)) || h.facing;

  const st = h.state;
  switch (st.kind) {
    case 'ground': {
      // ガス回復
      const cap = w.setup.hero.gas;
      h.gas = Math.min(cap, h.gas + C.gasRegenGround * (1 + 0.2 * (w.setup.hero.gear.tank - 1)) * dt);

      if (input.dodgePressed && h.gas >= C.gasDodge && h.dodgeCd <= 0) {
        const dir = norm(input.move.x || input.move.z ? input.move : fromAngle(h.facing));
        h.gas -= C.gasDodge;
        h.dodgeCd = C.dodgeCd;
        h.state = { kind: 'dodging', t: 0, dir };
        break;
      }
      if (input.anchorPressed && h.anchorCd <= 0 && h.gas >= C.gasAnchor) {
        const target = findAnchorTarget(h, input.cursor, w);
        if (target) {
          h.gas -= C.gasAnchor;
          h.anchorCd = C.anchorCd;
          h.state = { kind: 'reeling', target, t: 0 };
          break;
        }
      }
      if (input.reloadPressed && h.spareBlades >= 1 && h.bladeDur < C.bladeDurMax) {
        h.state = { kind: 'reloading', t: 0 };
        break;
      }
      // 移動（加速度あり）。ガスが尽きると遅くなる
      const speed = C.moveSpeed * (h.gas <= 0 ? C.noGasSpeedMul : 1);
      const want = scale(input.move, speed);
      const dv = sub(want, h.vel);
      const dl = Math.hypot(dv.x, dv.z);
      const maxDv = C.accel * dt;
      h.vel = dl <= maxDv ? want : add(h.vel, scale(dv, maxDv / dl));
      h.pos = add(h.pos, scale(h.vel, dt));

      if (input.attackHeld && h.attackCd <= 0 && h.bladeDur > 0) {
        w.pending.push({ kind: 'heroSlash' });
        h.bladeDur -= 1;
        h.attackCd = C.attackCd;
      }
      break;
    }
    case 'dodging': {
      st.t += dt;
      h.pos = add(h.pos, scale(st.dir, C.dodgeSpeed * dt));
      if (st.t >= C.dodgeTime) { h.vel = scale(st.dir, C.moveSpeed * 0.5); h.state = { kind: 'ground' }; }
      break;
    }
    case 'reeling': {
      st.t += dt;
      const dest = reelDestination(h, st.target, w);
      if (!dest || st.t > C.reelTimeout) { h.state = { kind: 'ground' }; break; }
      const to = sub(dest, h.pos);
      const d = Math.hypot(to.x, to.z);
      const arrive = st.target.kind === 'point' ? 1.2 : 0.8;
      if (d <= arrive) {
        if (st.target.kind === 'point') {
          h.vel = scale(norm(to), C.reelSpeed * 0.3);
          h.state = { kind: 'ground' };
        } else if (st.target.nape) {
          h.vel = { x: 0, z: 0 };
          h.state = { kind: 'mounted', titanId: st.target.titanId, t: 0 };
        } else {
          // 身体に弾かれる
          const t = w.titans.find((x) => x.id === (st.target as { titanId: string }).titanId);
          if (t) h.pos = add(t.pos, scale(norm(sub(h.pos, t.pos)), bodyR(t.size) + 1));
          h.vel = { x: 0, z: 0 };
          stun(h, C.bounceStun);
        }
        break;
      }
      const step = Math.min(d, C.reelSpeed * dt);
      h.vel = scale(norm(to), C.reelSpeed);
      h.pos = add(h.pos, scale(norm(to), step));
      break;
    }
    case 'mounted': {
      const t = w.titans.find((x) => x.id === st.titanId);
      if (!t || !isAlive(t)) { h.state = { kind: 'ground' }; break; }
      h.pos = partPos(t, 'nape');
      h.vel = { x: 0, z: 0 };
      if (input.dodgePressed) {
        // 離脱
        const away = norm(sub(h.pos, t.pos));
        h.gas = Math.max(0, h.gas - C.gasDodge);
        h.state = { kind: 'dodging', t: 0, dir: away };
        break;
      }
      if (t.state.kind === 'shaking') { st.t += dt; break; } // 振り払われ中は斬れない
      st.t += dt;
      if (st.t >= C.mountTime) {
        w.pending.push({ kind: 'napeStrike', titanId: t.id });
        // 巨人の背後に着地
        h.pos = add(partPos(t, 'nape'), scale(fromAngle(t.facing + Math.PI), 1.5));
        h.facing = t.facing;
        h.state = { kind: 'ground' };
      }
      break;
    }
    case 'reloading': {
      st.t += dt;
      if (st.t >= C.reloadTime) {
        h.bladeDur = C.bladeDurMax;
        h.spareBlades -= 1;
        h.state = { kind: 'ground' };
      }
      break;
    }
    case 'stunned': {
      st.t -= dt;
      h.vel = scale(h.vel, Math.max(0, 1 - 8 * dt));
      h.pos = add(h.pos, scale(h.vel, dt));
      if (st.t <= 0) h.state = { kind: 'ground' };
      break;
    }
  }

  // 必殺（ゲージ満タン）
  if (input.superPressed && h.superCharge >= 1) {
    h.superCharge = 0;
    w.squadOrder = 'charge';
    w.chargeT = C.superDuration;
  }
  h.pos = {
    x: clamp(h.pos.x, 0.5, w.setup.stage.w - 0.5),
    z: clamp(h.pos.z, 0.5, w.setup.stage.h - 0.5),
  };
}
