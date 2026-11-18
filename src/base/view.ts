import * as THREE from 'three';
import { BASE, wallBounds } from '../config/base';
import { BUILDING_DEFS } from './defs';
import { footprint } from './grid';
import type { BaseState, Building, BuildingType, Terrain } from './types';

const C = BASE.cell;
const TERRAIN_COLOR: Record<Terrain, number> = { grass: 0x78b060, forest: 0x4f8a45, rock: 0x8a8a84, river: 0x4a90d0 };
const TYPE_COLOR: Record<BuildingType, number> = {
  hq: 0xc8a050, house: 0xd8b078, farm: 0xe0d060, lumber: 0x8a6038, workshop: 0x888890,
  training: 0xc86050, infirmary: 0xf0f0f0, watchtower: 0xa09070,
};
const TYPE_HEIGHT: Record<BuildingType, number> = {
  hq: 2.6, house: 1.6, farm: 0.4, lumber: 1.4, workshop: 1.8, training: 1.4, infirmary: 1.6, watchtower: 4,
};

/** 状態を読んでメッシュを作るだけ。ロジックは書き換えない */
export class BaseView {
  private ground!: THREE.InstancedMesh;
  private dynamic = new THREE.Group();   // 建物・壁（refreshごとに作り直す）
  private ghost: THREE.Mesh;
  private select: THREE.LineSegments;
  private lastStage = -1;

  constructor(private scene: THREE.Scene, base: BaseState) {
    scene.background = new THREE.Color(0x9ec6e0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(-30, 60, 20);
    scene.add(sun);
    scene.add(this.dynamic);

    // 地面（1マス1インスタンス）
    const N = BASE.size;
    const geo = new THREE.BoxGeometry(C * 0.98, 0.3, C * 0.98);
    this.ground = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ flatShading: true }), N * N);
    const m = new THREE.Matrix4();
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const t = base.terrain[z * N + x];
      m.makeTranslation((x + 0.5) * C, t === 'river' ? -0.2 : -0.15, (z + 0.5) * C);
      this.ground.setMatrixAt(z * N + x, m);
    }
    scene.add(this.ground);

    // 森と岩の飾り
    const trees: THREE.Matrix4[] = [], rocks: THREE.Matrix4[] = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const t = base.terrain[z * N + x];
      const h = ((x * 73856093) ^ (z * 19349663)) >>> 0;
      if (t === 'forest') {
        const mm = new THREE.Matrix4().makeTranslation((x + 0.3 + (h % 5) * 0.1) * C, 1.4, (z + 0.3 + ((h >> 3) % 5) * 0.1) * C);
        trees.push(mm);
      } else if (t === 'rock') {
        rocks.push(new THREE.Matrix4().makeTranslation((x + 0.5) * C, 0.5, (z + 0.5) * C));
      }
    }
    const treeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.9, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x2f6b34, flatShading: true }), Math.max(1, trees.length));
    trees.forEach((mm, i) => treeMesh.setMatrixAt(i, mm)); treeMesh.count = trees.length;
    const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.9), new THREE.MeshStandardMaterial({ color: 0x77776f, flatShading: true }), Math.max(1, rocks.length));
    rocks.forEach((mm, i) => rockMesh.setMatrixAt(i, mm)); rockMesh.count = rocks.length;
    scene.add(treeMesh, rockMesh);

    // 配置中の半透明表示と選択枠
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, depthWrite: false }));
    this.ghost.visible = false;
    this.select = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffff00 }));
    this.select.visible = false;
    scene.add(this.ghost, this.select);
  }

  /** 建物・壁・地面の色を作り直す */
  refresh(base: BaseState): void {
    const wb = wallBounds(base.wall.stage);
    const N = BASE.size;
    const col = new THREE.Color();
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      col.setHex(TERRAIN_COLOR[base.terrain[z * N + x]]);
      if (x < wb.min || x > wb.max || z < wb.min || z > wb.max) col.multiplyScalar(0.7); // 壁の外は暗く
      this.ground.setColorAt(z * N + x, col);
    }
    this.ground.instanceColor!.needsUpdate = true;
    this.ground.instanceMatrix.needsUpdate = true;

    this.dynamic.clear();
    // 壁：外周に沿った箱。各辺の中央は門（低く別色）
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xb8b0a0, flatShading: true });
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, flatShading: true });
    const mid = Math.floor((wb.min + wb.max) / 2);
    const isGate = (x: number, z: number) => (z === wb.min - 1 || z === wb.max + 1) ? (x === mid || x === mid + 1) : (z === mid || z === mid + 1);
    const damaged = base.wall.hp / base.wall.hpMax;
    for (let i = wb.min - 1; i <= wb.max + 1; i++) {
      for (const [x, z] of [[i, wb.min - 1], [i, wb.max + 1], [wb.min - 1, i], [wb.max + 1, i]]) {
        const gate = isGate(x, z);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(C, gate ? 1.2 : 3.2 * (0.4 + 0.6 * damaged), C), gate ? gateMat : wallMat);
        mesh.position.set((x + 0.5) * C, gate ? 0.6 : 1.6 * (0.4 + 0.6 * damaged), (z + 0.5) * C);
        this.dynamic.add(mesh);
      }
    }
    for (const b of base.buildings) this.dynamic.add(this.buildingMesh(b));
    this.lastStage = base.wall.stage;
  }

  private buildingMesh(b: Building): THREE.Mesh {
    const cells = footprint(b);
    const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
    const w = Math.max(...xs) - Math.min(...xs) + 1, d = Math.max(...zs) - Math.min(...zs) + 1;
    const h = TYPE_HEIGHT[b.type] * (1 + 0.1 * (b.level - 1));
    const constructing = b.status.kind === 'constructing';
    const mat = new THREE.MeshStandardMaterial({
      color: b.status.kind === 'damaged' ? 0x884444 : TYPE_COLOR[b.type], flatShading: true,
      transparent: constructing, opacity: constructing ? 0.5 : 1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * C * 0.92, h, d * C * 0.92), mat);
    mesh.position.set((Math.min(...xs) + w / 2) * C, h / 2, (Math.min(...zs) + d / 2) * C);
    return mesh;
  }

  /** 配置中の半透明の建物。null で非表示 */
  setGhost(g: { type: BuildingType; x: number; z: number; rot: 0 | 1; ok: boolean } | null): void {
    if (!g) { this.ghost.visible = false; return; }
    const cells = footprint(g);
    const w = BUILDING_DEFS[g.type][g.rot ? 'h' : 'w'], d = BUILDING_DEFS[g.type][g.rot ? 'w' : 'h'];
    void cells;
    this.ghost.visible = true;
    this.ghost.scale.set(w * C, TYPE_HEIGHT[g.type], d * C);
    this.ghost.position.set((g.x + w / 2) * C, TYPE_HEIGHT[g.type] / 2 + 0.05, (g.z + d / 2) * C);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(g.ok ? 0x30e030 : 0xe03030);
  }

  setSelection(b: Building | null): void {
    if (!b) { this.select.visible = false; return; }
    const cells = footprint(b);
    const xs = cells.map((c) => c.x), zs = cells.map((c) => c.z);
    const w = Math.max(...xs) - Math.min(...xs) + 1, d = Math.max(...zs) - Math.min(...zs) + 1;
    const h = TYPE_HEIGHT[b.type] * (1 + 0.1 * (b.level - 1)) + 0.4;
    this.select.visible = true;
    this.select.scale.set(w * C, h, d * C);
    this.select.position.set((Math.min(...xs) + w / 2) * C, h / 2, (Math.min(...zs) + d / 2) * C);
  }

  get stage(): number { return this.lastStage; }
}
