import * as THREE from 'three';
import type { GameScene } from '../core/sceneManager';
import type { InputManager } from '../core/input';
import { groundPoint, placeCamera } from '../render/renderer';
import type { Renderer3D } from '../render/renderer';
import { Effects } from '../render/effects';
import { lerp } from '../core/geometry';
import { COMBAT as C } from '../config/combat';
import type { CombatEvent, CombatResult, CombatSetup, CombatWorld } from './types';
import { createWorld, stepWorld } from './world';
import { CombatView } from './view';
import { CombatHud } from './hud';
import { isInNapeZone, bodyR } from './titan';

export class CombatScene implements GameScene<CombatSetup, CombatResult> {
  private scene = new THREE.Scene();
  private world!: CombatWorld;
  private view!: CombatView;
  private hud!: CombatHud;
  private fx!: Effects;
  private done: ((r: CombatResult) => void) | null = null;
  private camTarget = { x: 0, z: 0 };

  constructor(private r3: Renderer3D, private input: InputManager, private uiHost: HTMLElement) {}

  enter(setup: CombatSetup, done: (r: CombatResult) => void): void {
    this.done = done;
    this.world = createWorld(setup);
    this.view = new CombatView(this.scene, this.world);
    this.hud = new CombatHud(this.uiHost);
    this.fx = new Effects(this.scene);
    this.camTarget = { ...this.world.hero.pos };
  }

  update(dt: number): void {
    const w = this.world;
    if (w.result) { this.fx.update(dt); return; }
    this.input.poll();
    // マウスの地面座標（カメラが動くので毎ステップ求める）
    const gp = groundPoint(this.r3.camera, this.input.ndc.x, this.input.ndc.y);
    if (gp) this.input.state.cursor = gp;

    this.fx.update(dt);
    const gdt = this.fx.scaleDt(dt);
    if (gdt <= 0) return;
    const events = stepWorld(w, this.input.state, gdt);
    for (const e of events) this.onEvent(e);

    if (w.result) {
      const result = w.result;
      this.hud.showResult(result, () => this.done?.(result));
    }
  }

  private onEvent(e: CombatEvent): void {
    const w = this.world;
    switch (e.kind) {
      case 'titanKilled': {
        const t = w.titans.find((x) => x.id === e.titanId);
        if (t) this.fx.puffDust(t.pos, bodyR(t.size) * 1.5);
        if (e.byHero) { this.fx.hitStop(); this.fx.slowMo(); this.fx.shake(); }
        else this.fx.shake(0.2, 0.2);
        break;
      }
      case 'partBroken': this.fx.hitStop(0.04); this.fx.shake(0.15, 0.15); break;
      case 'heroHit': this.fx.shake(0.25, 0.2); break;
      case 'heroSlashed': if (e.hit) this.fx.hitStop(0.02); break;
    }
  }

  render(_alpha: number): void {
    const w = this.world;
    // カメラは主人公を追う
    this.camTarget.x = lerp(this.camTarget.x, w.hero.pos.x, 0.1);
    this.camTarget.z = lerp(this.camTarget.z, w.hero.pos.z, 0.1);
    placeCamera(this.r3.camera, this.camTarget, this.fx.shakeOffset());
    this.view.render(w);
    const napeReady = w.titans.some((t) => t.state.kind !== 'dying' && isInNapeZone(w.hero.pos, t))
      && w.hero.state.kind === 'ground' && w.hero.gas >= C.gasAnchor;
    this.hud.update(w, napeReady);
    this.r3.renderer.render(this.scene, this.r3.camera);
  }

  exit(): void {
    this.hud.dispose();
    this.view.dispose();
    this.fx.dispose();
    this.scene.clear();
  }
}
