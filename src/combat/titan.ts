import { COMBAT as C } from '../config/combat';
import type { Rng } from '../core/rng';
import {
  add, angleDiff, angleOf, clamp, dist, fromAngle, inSector, scale, sub, turnToward,
} from '../core/geometry';
import type { Vec2 } from '../state/types';
import type {
  CombatWorld, PartId, Part, TitanAttack, TitanEntity, TitanKind,
} from './types';

export const bodyR = (size: number): number => size * 0.12;
export const titanSpeed = (t: TitanEntity): number =>
  (1.2 + t.size * 0.15) * (t.kind === 'abnormal' ? C.abnormalSpeedMul : 1);

const mkPart = (max: number): Part => ({ hp: max, max, broken: false, regenT: 0, lastHitT: 99 });

export function createTitan(id: string, kind: TitanKind, size: number, pos: Vec2, facing: number): TitanEntity {
  const nape = kind === 'intelligent' ? 3 : 1;
  const leg = 30 + size * 4;
  const arm = 20 + size * 3;
  return {
    id, kind, size, pos, facing,
    parts: { legL: mkPart(leg), legR: mkPart(leg), armL: mkPart(arm), armR: mkPart(arm), nape: mkPart(nape) },
    state: { kind: 'wander', goal: { ...pos } },
    wanderT: 0, jitter: 0, lostT: 0, cd: 0,
  };
}

/** 部位の地面上の位置 */
export function partPos(t: TitanEntity, part: PartId): Vec2 {
  const f = fromAngle(t.facing);
  const side = { x: -f.z, z: f.x };
  const r = bodyR(t.size);
  switch (part) {
    case 'legL': return add(t.pos, scale(side, -r * 0.7));
    case 'legR': return add(t.pos, scale(side, r * 0.7));
    case 'armL': return add(add(t.pos, scale(f, r)), scale(side, -r));
    case 'armR': return add(add(t.pos, scale(f, r)), scale(side, r));
    case 'nape': return add(t.pos, scale(f, -r * 0.8));
  }
}

/** うなじゾーン：背中側の扇形（胴体の円の内側は除く） */
export function isInNapeZone(p: Vec2, t: TitanEntity): boolean {
  const d = dist(p, t.pos);
  if (d <= bodyR(t.size) || d > t.size * 0.9) return false;
  const back = t.facing + Math.PI;
  return Math.abs(angleDiff(angleOf(sub(p, t.pos)), back)) <= C.napeHalfAngle;
}

/** 攻撃の予告範囲（半径と形）。窓口はここだけにして、判定・描画・隊員AIで共有する */
export function attackZone(t: TitanEntity, attack: TitanAttack): { r: number; half: number } {
  switch (attack) {
    case 'stomp': return { r: t.size * 0.3, half: Math.PI };
    case 'grab': return { r: t.size * 0.6, half: C.grabHalf };
    case 'swipe': return { r: t.size * 0.9, half: C.swipeHalf };
  }
}
export function inAttackZone(t: TitanEntity, attack: TitanAttack, p: Vec2): boolean {
  const z = attackZone(t, attack);
  return inSector(t.pos, t.facing, z.r, z.half, p);
}

export const isAlive = (t: TitanEntity): boolean => t.state.kind !== 'dying';
export const legsBroken = (t: TitanEntity): boolean => t.parts.legL.broken || t.parts.legR.broken;
export const armsLeft = (t: TitanEntity): boolean => !t.parts.armL.broken || !t.parts.armR.broken;

/** 再生。再生した部位を返す */
export function regenParts(t: TitanEntity, dt: number): PartId[] {
  const done: PartId[] = [];
  for (const id of ['legL', 'legR', 'armL', 'armR'] as const) {
    const p = t.parts[id];
    if (p.broken) {
      p.regenT -= dt;
      if (p.regenT <= 0) { p.hp = p.max; p.broken = false; p.lastHitT = 99; done.push(id); }
    } else {
      p.lastHitT += dt;
      if (p.lastHitT >= C.regenDelay && p.hp < p.max) p.hp = Math.min(p.max, p.hp + C.regenRate * p.max * dt);
    }
  }
  return done;
}

interface Human { id: string; pos: Vec2; isHero: boolean }
function humans(w: CombatWorld): Human[] {
  const out: Human[] = [];
  const hs = w.hero.state.kind;
  if (hs !== 'down' && hs !== 'mounted') out.push({ id: 'hero', pos: w.hero.pos, isHero: true });
  for (const s of w.soldiers) {
    if (s.state.kind === 'down' || s.state.kind === 'grabbed') continue;
    out.push({ id: s.id, pos: s.pos, isHero: false });
  }
  return out;
}
function posOfHuman(w: CombatWorld, id: string): Vec2 | null {
  if (id === 'hero') {
    const k = w.hero.state.kind;
    return k === 'down' || k === 'mounted' ? null : w.hero.pos;
  }
  const s = w.soldiers.find((x) => x.id === id);
  return s && s.state.kind !== 'down' && s.state.kind !== 'grabbed' ? s.pos : null;
}

function canSee(t: TitanEntity, p: Vec2): boolean {
  const d = dist(t.pos, p);
  if (d <= 4) return true;
  if (d > 12 + t.size) return false;
  return Math.abs(angleDiff(angleOf(sub(p, t.pos)), t.facing)) <= Math.PI / 3;
}

function pickTarget(t: TitanEntity, w: CombatWorld): Human | null {
  const hs = humans(w);
  if (hs.length === 0) return null;
  const nearest = (list: Human[]) =>
    list.reduce<Human | null>((b, h) => (!b || dist(h.pos, t.pos) < dist(b.pos, t.pos) ? h : b), null);
  if (t.kind === 'abnormal') {
    // 視界を無視して一番近い隊員を狙う（隊員がいなければ主人公）
    return nearest(hs.filter((h) => !h.isHero)) ?? nearest(hs);
  }
  return nearest(hs.filter((h) => canSee(t, h.pos)));
}

/** 行動の再開：一番近い人間を追う（いなければ徘徊） */
function resumeState(t: TitanEntity, w: CombatWorld): TitanEntity['state'] {
  const hs = humans(w);
  if (hs.length === 0) return { kind: 'wander', goal: { ...t.pos } };
  const n = hs.reduce((b, h) => (dist(h.pos, t.pos) < dist(b.pos, t.pos) ? h : b));
  return { kind: 'chase', targetId: n.id };
}

function moveTitan(t: TitanEntity, heading: number, speed: number, dt: number, w: CombatWorld): void {
  t.facing = turnToward(t.facing, heading, C.turnRate * dt);
  const diff = Math.abs(angleDiff(heading, t.facing));
  const k = diff < Math.PI / 2 ? 1 : 0.3;
  const f = fromAngle(t.facing);
  const st = w.setup.stage;
  t.pos = {
    x: clamp(t.pos.x + f.x * speed * k * dt, 1, st.w - 1),
    z: clamp(t.pos.z + f.z * speed * k * dt, 1, st.h - 1),
  };
}

export const shakeDelayOf = (t: TitanEntity): number => C.shakeDelay[t.kind];

function newWanderGoal(t: TitanEntity, w: CombatWorld, rng: Rng): Vec2 {
  const st = w.setup.stage;
  return { x: rng.range(3, st.w - 3), z: rng.range(3, st.h - 3) };
}

/** 巨人1体を1ステップ更新。攻撃の意図は w.pending に積む */
export function updateTitan(t: TitanEntity, w: CombatWorld, dt: number, rng: Rng): void {
  regenParts(t, dt);
  t.cd = Math.max(0, t.cd - dt);

  if (t.state.kind === 'dying') { t.state.t += dt; return; }

  // 主人公が張り付いて shakeDelay 経過 → 振り払い開始
  const hero = w.hero;
  const k = t.state.kind;
  if ((k === 'wander' || k === 'chase' || k === 'windup')
    && hero.state.kind === 'mounted' && hero.state.titanId === t.id
    && hero.state.t >= shakeDelayOf(t)) {
    t.state = { kind: 'shaking', t: 0 };
    return;
  }
  // 脚が壊れたら膝をつく
  if ((k === 'wander' || k === 'chase' || k === 'windup') && legsBroken(t)) {
    t.state = { kind: 'kneel', t: 0 };
    return;
  }

  switch (t.state.kind) {
    case 'wander': {
      const target = pickTarget(t, w);
      if (target) { t.state = { kind: 'chase', targetId: target.id }; t.lostT = 0; break; }
      const goal = t.state.goal;
      if (dist(t.pos, goal) < 1.5) { t.state = { kind: 'wander', goal: newWanderGoal(t, w, rng) }; break; }
      moveTitan(t, angleOf(sub(goal, t.pos)), titanSpeed(t) * 0.6, dt, w);
      break;
    }
    case 'chase': {
      let tp = posOfHuman(w, t.state.targetId);
      if (t.kind === 'abnormal') {
        // 一番近い隊員に狙いを切り替え続ける
        const nt = pickTarget(t, w);
        if (nt) { t.state = { kind: 'chase', targetId: nt.id }; tp = nt.pos; }
      }
      if (!tp) { t.state = { kind: 'wander', goal: newWanderGoal(t, w, rng) }; break; }
      // 見失い判定
      if (t.kind !== 'abnormal' && !canSee(t, tp)) t.lostT += dt; else t.lostT = 0;
      if (t.lostT >= C.lostSightTime) { t.state = { kind: 'wander', goal: newWanderGoal(t, w, rng) }; break; }

      const d = dist(t.pos, tp);
      const aimAngle = angleOf(sub(tp, t.pos));
      const frontal = Math.abs(angleDiff(aimAngle, t.facing)) <= Math.PI / 4;
      if (t.cd <= 0) {
        const attack = chooseAttack(t, d, frontal);
        if (attack) {
          t.state = { kind: 'windup', attack, t: 0, aim: { ...tp } };
          break;
        }
      }
      // 奇行種は2秒ごとに進路を乱数でぶらす
      let heading = aimAngle;
      if (t.kind === 'abnormal') {
        t.wanderT -= dt;
        if (t.wanderT <= 0) { t.wanderT = 2; t.jitter = rng.range(-0.7, 0.7); }
        heading += t.jitter;
      }
      if (d > t.size * 0.45) moveTitan(t, heading, titanSpeed(t), dt, w);
      else t.facing = turnToward(t.facing, aimAngle, C.turnRate * dt);
      break;
    }
    case 'windup': {
      t.state.t += dt;
      const need = C.windupTime * (t.kind === 'abnormal' ? C.abnormalWindupMul : 1);
      if (t.state.t >= need) {
        const { attack, aim } = t.state;
        w.pending.push({ kind: 'titanAttack', titanId: t.id, attack, aim });
        t.cd = C.titanCd;
        // 掴み成功なら resolve が holding に書き換える
        t.state = resumeState(t, w);
      }
      break;
    }
    case 'holding':
      break; // 時間は updateGrabs が進める
    case 'shaking': {
      t.state.t += dt;
      if (t.state.t >= C.shakeTime) {
        t.state = resumeState(t, w);
        if (hero.state.kind === 'mounted' && hero.state.titanId === t.id) {
          const away = fromAngle(angleOf(sub(hero.pos, t.pos)));
          hero.pos = add(t.pos, scale(away, bodyR(t.size) + 3));
          hero.vel = { x: 0, z: 0 };
          hero.hp -= C.shakeDmg;
          w.events.push({ kind: 'heroHit', dmg: C.shakeDmg });
          hero.state = { kind: 'stunned', t: C.shakeStun };
        }
      }
      break;
    }
    case 'kneel': {
      t.state.t += dt;
      if (t.state.t >= C.kneelTime && !legsBroken(t)) {
        t.state = resumeState(t, w);
      }
      break;
    }
  }
}

/** windupに入るときの攻撃の選び方 */
function chooseAttack(t: TitanEntity, d: number, frontal: boolean): TitanAttack | null {
  if (d <= t.size * 0.3) return 'stomp';
  if (!frontal || d > t.size * 0.9) return null;
  if (!armsLeft(t)) return null;
  return d <= t.size * 0.6 ? 'grab' : 'swipe';
}
