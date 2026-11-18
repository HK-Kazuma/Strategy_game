import type { Vec2, Hero, Captain, Soldier, CaptainType, Resources } from '../state/types';
import type { Rng } from '../core/rng';
import type { Order } from '../core/input';

export type { Order };
export type TitanKind = 'normal' | 'abnormal' | 'intelligent';
export type Objective = 'annihilate' | 'breakthrough' | 'escort'; // P1はannihilateのみ

export interface StageDef {
  w: number; h: number;
  terrain: 'forest' | 'ruins' | 'plain';
  anchors: { id: string; pos: Vec2 }[];      // 木や建物（アンカーの支点）
  obstacles: { pos: Vec2; r: number }[];     // 通れない円
  heroSpawn: Vec2;
  exit: { x: number; z: number; w: number; h: number };
}

export interface CombatSetup {
  seed: number;
  stage: StageDef;
  objective: Objective;
  hero: { gear: Hero['gear']; gas: number; blades: number };
  squads: { squadId: string; captain: Captain | null; soldiers: Soldier[] }[];
  titans: { kind: TitanKind; pos: Vec2; size: number }[];
}

export interface CombatResult {
  outcome: 'victory' | 'retreat' | 'heroDown';
  kills: { kind: TitanKind; size: number; byHero: boolean }[];
  gasLeft: number; bladesLeft: number;
  injuredSoldierIds: string[];
  deadCaptainIds: string[];
  heroInjured: boolean;
  durationSec: number;
}

export type AnchorTarget =
  | { kind: 'point'; pos: Vec2 }
  | { kind: 'titan'; titanId: string; nape: boolean };

// t は「経過時間」。stunned だけは「残り時間」
export type HeroState =
  | { kind: 'ground' }
  | { kind: 'dodging'; t: number; dir: Vec2 }
  | { kind: 'reeling'; target: AnchorTarget; t: number }
  | { kind: 'mounted'; titanId: string; t: number }
  | { kind: 'reloading'; t: number }
  | { kind: 'stunned'; t: number }
  | { kind: 'down' };

export interface HeroEntity {
  pos: Vec2; vel: Vec2; facing: number;
  hp: number; gas: number; bladeDur: number; spareBlades: number;
  superCharge: number;
  attackCd: number; dodgeCd: number; anchorCd: number;
  state: HeroState;
}

export type PartId = 'legL' | 'legR' | 'armL' | 'armR' | 'nape';
/** lastHitT＝最後に斬られてからの経過秒 */
export interface Part { hp: number; max: number; broken: boolean; regenT: number; lastHitT: number }

export type TitanAttack = 'grab' | 'stomp' | 'swipe';
export type TitanState =
  | { kind: 'wander'; goal: Vec2 }
  | { kind: 'chase'; targetId: string }
  | { kind: 'windup'; attack: TitanAttack; t: number; aim: Vec2 }
  | { kind: 'holding'; victimId: string; arm: 'armL' | 'armR'; t: number }
  | { kind: 'shaking'; t: number }
  | { kind: 'kneel'; t: number }
  | { kind: 'dying'; t: number };

export interface TitanEntity {
  id: string; kind: TitanKind; size: number;
  pos: Vec2; facing: number;
  parts: Record<PartId, Part>;
  state: TitanState;
  wanderT: number;   // 奇行種の方向転換タイマー
  jitter: number;    // 奇行種の進路のぶれ（rad）
  lostT: number;     // 目標を見失っている時間
  cd: number;        // 次の攻撃までの待ち
}

export type SoldierState =
  | { kind: 'follow' }
  | { kind: 'engage'; titanId: string; part: PartId }
  | { kind: 'evade'; dir: Vec2; t: number }
  | { kind: 'rescue'; titanId: string }
  | { kind: 'grabbed'; titanId: string }
  | { kind: 'retreat' }
  | { kind: 'down' };

export interface SoldierEntity {
  id: string; squadId: string; isCaptain: boolean; captainType: CaptainType | null;
  level: number; hp: number;
  pos: Vec2; vel: Vec2; facing: number;
  state: SoldierState; dangerT: number; attackCd: number;
  slot: number; // 隊列での並び順
}

export type Intent =
  | { kind: 'heroSlash' }
  | { kind: 'napeStrike'; titanId: string }
  | { kind: 'soldierSlash'; soldierId: string; titanId: string; part: PartId }
  | { kind: 'titanAttack'; titanId: string; attack: TitanAttack; aim: Vec2 };

export type CombatEvent =
  | { kind: 'partBroken'; titanId: string; part: PartId }
  | { kind: 'titanKilled'; titanId: string; byHero: boolean }
  | { kind: 'grabbed'; titanId: string; victimId: string }
  | { kind: 'rescued'; victimId: string }
  | { kind: 'soldierDown'; soldierId: string }
  | { kind: 'captainKilled'; soldierId: string }
  | { kind: 'heroHit'; dmg: number }
  | { kind: 'heroSlashed'; hit: boolean };

export interface CombatWorld {
  setup: CombatSetup; time: number; rng: Rng;
  hero: HeroEntity; soldiers: SoldierEntity[]; titans: TitanEntity[];
  squadOrder: Order; chargeT: number;
  heroLastTargetId: string | null;
  pending: Intent[];
  events: CombatEvent[];
  gathered: Partial<Resources>;
  // 結果の集計
  kills: CombatResult['kills'];
  deadCaptainIds: string[];
  result: CombatResult | null;
}
