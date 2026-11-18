import * as THREE from 'three';
import type { GameScene } from '../core/sceneManager';
import { createRng } from '../core/rng';
import { BASE } from '../config/base';
import type { GameState } from '../state/types';
import { saveGame, clearSave } from '../state/save';
import { createNewGame } from '../state/initial';
import { placeBuilding, moveBuilding, demolish, levelUp, setWorkers, setRecipe, repairWall, reserveTraining } from './actions';
import { canPlace, occupancy, REASON_TEXT } from './grid';
import { BUILDING_DEFS } from './defs';
import { advancePhase } from './day';
import { cellAt } from './picking';
import { BaseView } from './view';
import { BaseUi } from './ui';
import type { Building, BuildingType, RecipeId } from './types';
import { placeCamera } from '../render/renderer';
import type { Renderer3D } from '../render/renderer';
import { groundPoint } from '../render/renderer';

type Mode = { kind: 'idle' } | { kind: 'place'; type: BuildingType; rot: 0 | 1 } | { kind: 'move'; id: string; rot: 0 | 1 };

/** P2：拠点シーン。ロジックは base/*.ts、ここは入力と画面の橋渡し */
export class BaseScene implements GameScene<GameState, void> {
  private scene = new THREE.Scene();
  private s!: GameState;
  private view!: BaseView;
  private ui!: BaseUi;
  private mode: Mode = { kind: 'idle' };
  private selectedId: string | null = null;
  private message = '';
  private msgT = 0;
  private hover: { x: number; z: number } | null = null;
  private ndc = { x: 0, y: 0 };
  private keys = new Set<string>();
  private dragAnchor: { x: number; z: number } | null = null;
  private cam = { x: BASE.size * BASE.cell / 2, z: BASE.size * BASE.cell / 2 };
  private zoom = 0.6;
  private off: (() => void)[] = [];
  private debug = new URLSearchParams(location.search).has('debug');

  constructor(private r3: Renderer3D, private uiHost: HTMLElement) {}

  enter(state: GameState): void {
    this.s = state;
    this.view = new BaseView(this.scene, state.base);
    this.view.refresh(state.base);
    this.ui = new BaseUi(this.uiHost, (a, arg) => this.onAction(a, arg));
    this.r3.camera.zoom = this.zoom;
    this.r3.camera.updateProjectionMatrix();

    const el = this.r3.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, k: string, f: (e: any) => void) => {
      t.addEventListener(k, f); this.off.push(() => t.removeEventListener(k, f));
    };
    void on;
    on(el, 'mousemove', (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      this.ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -(((e.clientY - r.top) / r.height) * 2 - 1) };
    });
    on(el, 'mousedown', (e: MouseEvent) => {
      if (e.button === 1) { e.preventDefault(); this.dragAnchor = groundPoint(this.r3.camera, this.ndc.x, this.ndc.y); }
      if (e.button === 0) this.onClick();
      if (e.button === 2) this.onCancel();
    });
    on(window, 'mouseup', (e: MouseEvent) => { if (e.button === 1) this.dragAnchor = null; });
    on(el, 'contextmenu', (e: Event) => e.preventDefault());
    on(el, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.zoom = Math.min(2, Math.max(0.3, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
      this.r3.camera.zoom = this.zoom; this.r3.camera.updateProjectionMatrix();
    });
    on(window, 'keydown', (e: KeyboardEvent) => {
      this.keys.add(e.code);
      if (e.code === 'KeyR') this.rotate();
      if (e.code === 'Escape') this.onCancel();
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    this.sync();
  }

  // ---- 入力 ----
  private selected(): Building | null { return this.s.base.buildings.find((b) => b.id === this.selectedId) ?? null; }

  private toastMsg(m: string): void { this.message = m; this.msgT = 2.5; this.sync(); }
  private err(code: string): void { this.toastMsg(REASON_TEXT[code] ?? code); }

  private ghostOrigin(type: BuildingType, rot: 0 | 1): { x: number; z: number } | null {
    if (!this.hover) return null;
    const d = BUILDING_DEFS[type];
    const w = rot ? d.h : d.w, h = rot ? d.w : d.h;
    return { x: this.hover.x - Math.floor((w - 1) / 2), z: this.hover.z - Math.floor((h - 1) / 2) };
  }

  private onClick(): void {
    const m = this.mode;
    if (m.kind === 'place') {
      const o = this.ghostOrigin(m.type, m.rot);
      if (!o) return;
      const r = placeBuilding(this.s, m.type, o.x, o.z, m.rot);
      if (!r.ok) return this.err(r.error);
      this.afterChange();
      if (!this.keys.has('ShiftLeft')) this.mode = { kind: 'idle' };
      this.sync();
    } else if (m.kind === 'move') {
      const b = this.s.base.buildings.find((x) => x.id === m.id)!;
      const o = this.ghostOrigin(b.type, m.rot);
      if (!o) return;
      const r = moveBuilding(this.s, m.id, o.x, o.z, m.rot);
      if (!r.ok) return this.err(r.error);
      this.mode = { kind: 'idle' };
      this.afterChange();
    } else {
      if (!this.hover) return;
      const id = occupancy(this.s.base)[this.hover.z * BASE.size + this.hover.x];
      this.selectedId = id;
      this.sync();
    }
  }

  private onCancel(): void {
    if (this.mode.kind !== 'idle') this.mode = { kind: 'idle' };
    else this.selectedId = null;
    this.sync();
  }

  private rotate(): void {
    if (this.mode.kind === 'place' || this.mode.kind === 'move') this.mode = { ...this.mode, rot: this.mode.rot ? 0 : 1 };
  }

  private onAction(act: string, arg?: string): void {
    const s = this.s;
    const sel = this.selected();
    const run = (r: { ok: boolean; error?: string } | void) => {
      if (r && !r.ok) return this.err(r.error!);
      this.afterChange();
    };
    switch (act) {
      case 'build': this.mode = { kind: 'place', type: arg as BuildingType, rot: 0 }; this.selectedId = null; this.sync(); break;
      case 'w': if (sel) run(setWorkers(s, sel.id, sel.workers + Number(arg))); break;
      case 'recipe': if (sel) run(setRecipe(s, sel.id, arg as RecipeId)); break;
      case 'levelup': if (sel) run(levelUp(s, sel.id)); break;
      case 'move': if (sel) { this.mode = { kind: 'move', id: sel.id, rot: sel.rot }; this.sync(); } break;
      case 'demolish': if (sel) { const r = demolish(s, sel.id); if (r.ok) this.selectedId = null; run(r); } break;
      case 'deselect': this.selectedId = null; this.sync(); break;
      case 'train': reserveTraining(s, Number(arg)); this.afterChange(); break;
      case 'repair': run(repairWall(s, 10)); break;
      case 'next': this.next(); break;
      case 'newgame':
        if (confirm('新規ゲームを始めます。今のセーブは消えます。よろしいですか？')) {
          clearSave();
          this.exitAndRestart();
        }
        break;
      case 'dbg-res': for (const k of ['wood', 'stone', 'food', 'iron'] as const) s.resources[k] += 100; this.afterChange(); break;
      case 'dbg-ore': s.resources.ironOre += 20; s.resources.crystal += 20; this.afterChange(); break;
      case 'dbg-day': this.skipDays(1); break;
      case 'dbg-10': this.skipDays(10); break;
    }
  }

  private exitAndRestart(): void {
    const fresh = createNewGame(Math.floor(Math.random() * 1e9));
    this.exit();
    this.scene = new THREE.Scene();
    this.enter(fresh);
    saveGame(fresh);
  }

  private rngFor(): ReturnType<typeof createRng> {
    const order = { morning: 0, day: 1, night: 2 }[this.s.phase];
    return createRng((this.s.seed ^ Math.imul(this.s.day, 2654435761) ^ (order * 40503)) >>> 0);
  }

  private next(): void {
    this.mode = { kind: 'idle' };
    const wasNight = this.s.phase === 'night';
    const { report, events } = advancePhase(this.s, this.rngFor());
    if (this.s.phase === 'morning') saveGame(this.s); // 毎朝の自動保存
    this.afterChange();
    if (wasNight && report) {
      this.ui.showReport(report, () => {
        if (events.some((e) => e.kind === 'wallBroken')) this.toastMsg('壁が破られました！（奇襲はP4で実装）');
      });
    }
  }

  private skipDays(n: number): void {
    for (let d = 0; d < n; d++) {
      do { advancePhase(this.s, this.rngFor()); } while (this.s.phase !== 'morning');
    }
    saveGame(this.s);
    this.afterChange();
  }

  private afterChange(): void {
    this.view.refresh(this.s.base);
    this.sync();
  }

  private sync(): void {
    this.view.setSelection(this.selected());
    this.ui.refresh(this.s, {
      selected: this.selected(),
      placing: this.mode.kind === 'place' ? this.mode.type : null,
      message: this.mode.kind === 'move' ? '移動先をクリック（Rで回転、右クリックで取り消し）' : this.message,
      debug: this.debug,
    });
  }

  // ---- ループ ----
  update(dt: number): void {
    // 画面の上＝世界(+1,+1)、右＝(-1,+1)
    const f = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const r = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (f || r) {
      const sp = (40 / this.zoom) * dt / Math.SQRT2;
      this.cam.x += (f - r) * sp; this.cam.z += (f + r) * sp;
    }
    placeCamera(this.r3.camera, this.cam);
    if (this.dragAnchor) {
      const g = groundPoint(this.r3.camera, this.ndc.x, this.ndc.y);
      if (g) { this.cam.x += this.dragAnchor.x - g.x; this.cam.z += this.dragAnchor.z - g.z; }
    }
    const lim = BASE.size * BASE.cell;
    this.cam.x = Math.min(lim, Math.max(0, this.cam.x)); this.cam.z = Math.min(lim, Math.max(0, this.cam.z));

    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) { this.message = ''; this.sync(); } }
  }

  render(_alpha: number): void {
    placeCamera(this.r3.camera, this.cam);
    this.hover = cellAt(this.r3.camera, this.ndc.x, this.ndc.y);
    // 配置中の半透明表示
    const m = this.mode;
    const type = m.kind === 'place' ? m.type : m.kind === 'move' ? this.s.base.buildings.find((b) => b.id === m.id)?.type : null;
    if (type && (m.kind === 'place' || m.kind === 'move')) {
      const o = this.ghostOrigin(type, m.rot);
      if (o) {
        const ignore = m.kind === 'move' ? m.id : undefined;
        this.view.setGhost({ type, x: o.x, z: o.z, rot: m.rot, ok: canPlace(this.s.base, type, o.x, o.z, m.rot, ignore).ok });
      } else this.view.setGhost(null);
    } else this.view.setGhost(null);
    this.r3.renderer.render(this.scene, this.r3.camera);
  }

  exit(): void {
    for (const f of this.off) f();
    this.off = [];
    this.ui.dispose();
    this.scene.clear();
    this.r3.camera.zoom = 1;
    this.r3.camera.updateProjectionMatrix();
  }
}
