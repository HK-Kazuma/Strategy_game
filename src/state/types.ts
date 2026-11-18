// 共通の型（設計書「共通データモデル」）。P2以降の型は各章で追加する。
export type Vec2 = { x: number; z: number };

export type ResourceId =
  | 'wood' | 'stone' | 'food'
  | 'ironOre' | 'crystal'
  | 'iron' | 'gas' | 'blades';
export type Resources = Record<ResourceId, number>;

export type UnitStatus =
  | { kind: 'ready' }
  | { kind: 'away' }
  | { kind: 'injured'; daysLeft: number }
  | { kind: 'dead'; day: number };

export type CaptainType = 'holder' | 'rescuer' | 'scout' | 'striker';

export interface Soldier { id: string; name: string; level: number; xp: number; status: UnitStatus }
export interface Captain extends Soldier { type: CaptainType }
export interface Squad { id: string; captainId: string | null; soldierIds: string[] }

export type Rank = 'private' | 'leader' | 'squadLeader' | 'commander';
export interface Hero {
  rank: Rank; merit: number;
  gear: { blade: number; tank: number; anchor: number };
  status: UnitStatus;
}
