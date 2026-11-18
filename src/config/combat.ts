const deg = (d: number) => (d * Math.PI) / 180;

// 調整用パラメータ（設計書P1の表）。角度はラジアンに変換して持つ。
export const COMBAT = {
  // 主人公
  moveSpeed: 6, accel: 40, noGasSpeedMul: 0.6,
  dodgeSpeed: 14, dodgeTime: 0.25, dodgeCd: 0.6,
  reelSpeed: 22, anchorRange: 18, anchorSnap: 2.5, anchorCd: 0.4, reelTimeout: 2,
  gasMax: 100, gasAnchor: 8, gasDodge: 5, gasRegenGround: 2,
  bladeDurMax: 12, reloadTime: 0.6, attackCd: 0.35,
  slashRange: 2.4, slashHalfAngle: deg(50),
  heroHp: 100, heroSlashDmg: 12, napeDmg: 1, heroRadius: 0.4,
  mountTime: 0.35, shakeTime: 0.4, shakeDmg: 15,
  shakeDelay: { normal: 0.5, abnormal: 0.4, intelligent: 0.2 },
  bounceStun: 0.3, shakeStun: 1,
  // 巨人
  windupTime: 0.8, abnormalWindupMul: 0.6, abnormalSpeedMul: 1.4,
  holdTime: 3, kneelTime: 4,
  regenTime: 6, regenDelay: 2, regenRate: 0.1,
  napeHalfAngle: deg(60), turnRate: deg(70),
  grabDmgHero: 35, stompDmg: 30, swipeDmg: 12, swipeKnock: 3, titanCd: 1,
  grabHalf: deg(35), swipeHalf: deg(70),
  dyingTime: 2, lostSightTime: 6,
  // 隊員
  soldierHp: 40, soldierSpeed: 5.5, soldierDmgBase: 4, soldierAttackCd: 0.8, soldierRadius: 0.4,
  engageRange: 12, followDist: 3, slashReach: 1.6,
  holderLegMul: 1.3, rescuerHoldMul: 1.5, strikerGrabWeight: 0.6,
  // 必殺
  superDuration: 6, superGainSlash: 0.08, superGainKill: 0.3,
  // 演出
  hitStop: 0.08, slowMoScale: 0.3, slowMoTime: 0.4, shakeAmp: 0.4, shakeFxTime: 0.3,
} as const;

export const reactionDelay = (level: number): number => Math.max(0.15, 0.6 - 0.05 * level);
