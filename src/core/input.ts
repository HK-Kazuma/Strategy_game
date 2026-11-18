import type { Vec2 } from '../state/types';
import { norm } from './geometry';

export type Order = 'free' | 'gather' | 'retreat' | 'charge';

export interface InputState {
  move: Vec2;               // 世界座標系の移動方向（正規化済み、無入力なら0）
  cursor: Vec2;             // マウスの地面座標（シーンが書き込む）
  attackHeld: boolean;      // 左クリック押しっぱなし
  anchorPressed: boolean;   // 右クリック（押した瞬間）
  dodgePressed: boolean;    // Space
  reloadPressed: boolean;   // R
  superPressed: boolean;    // Q
  orderPressed: Order | null; // 1/2/3
}

export function emptyInput(): InputState {
  return {
    move: { x: 0, z: 0 }, cursor: { x: 0, z: 0 }, attackHeld: false,
    anchorPressed: false, dodgePressed: false, reloadPressed: false, superPressed: false, orderPressed: null,
  };
}

/** キー・マウス → InputState。画面の上(W)は世界の(+x,+z)方向（カメラ方位45°） */
export class InputManager {
  readonly state: InputState = emptyInput();
  /** マウスの正規化デバイス座標（-1〜1） */
  ndc = { x: 0, y: 0 };
  private keys = new Set<string>();

  constructor(target: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      if (k === 'Space') { this.state.dodgePressed = true; e.preventDefault(); }
      if (k === 'KeyR') this.state.reloadPressed = true;
      if (k === 'KeyQ') this.state.superPressed = true;
      if (k === 'Digit1') this.state.orderPressed = 'free';
      if (k === 'Digit2') this.state.orderPressed = 'gather';
      if (k === 'Digit3') this.state.orderPressed = 'retreat';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.state.attackHeld = false; });
    target.addEventListener('mousemove', (e) => {
      const r = target.getBoundingClientRect();
      this.ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      this.ndc.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.state.attackHeld = true;
      if (e.button === 2) this.state.anchorPressed = true;
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.state.attackHeld = false; });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** 毎ステップ前に呼んで移動ベクトルを更新 */
  poll(): void {
    const k = this.keys;
    const f = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0); // 画面の上下
    const r = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0); // 画面の左右
    // 画面の上 = (1,1)、画面の右 = (-1,1)
    this.state.move = norm({ x: f - r, z: f + r });
  }

  /** 1ステップ更新したあとに呼ぶ。押した瞬間系のフラグを消す */
  endTick(): void {
    this.state.anchorPressed = false;
    this.state.dodgePressed = false;
    this.state.reloadPressed = false;
    this.state.superPressed = false;
    this.state.orderPressed = null;
  }
}
