import * as THREE from 'three';
import { COMBAT as C } from '../config/combat';
import type { CombatWorld, SoldierEntity, TitanEntity, TitanKind } from './types';
import { attackZone, bodyR, isInNapeZone, partPos } from './titan';

const KIND_COLOR: Record<TitanKind, number> = { normal: 0xd8b99a, abnormal: 0xe0905a, intelligent: 0xa488c8 };

/** ロジックの状態を読んでメッシュを動かすだけ。ロジックは書き換えない */
export class CombatView {
  private titanViews = new Map<string, TitanView>();
  private soldierMeshes = new Map<string, THREE.Mesh>();
  private heroMesh: THREE.Mesh;
  private wire: THREE.Line;
  private telegraph = new Map<string, THREE.Mesh>();
  private sectorGeo = new Map<number, THREE.BufferGeometry>();
  private disposables: { dispose(): void }[] = [];

  constructor(private scene: THREE.Scene, w: CombatWorld) {
    const st = w.setup.stage;
    scene.background = new THREE.Color(0x9ec6e0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 40, 10);
    scene.add(sun);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(st.w, st.h).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x6fa05a, flatShading: true }),
    );
    ground.position.set(st.w / 2, 0, st.h / 2);
    scene.add(ground);
    const grid = new THREE.GridHelper(st.w, st.w / 2, 0x4f8040, 0x5f9050);
    grid.position.set(st.w / 2, 0.01, st.h / 2);
    scene.add(grid);

    // 出口
    const exit = new THREE.Mesh(
      new THREE.PlaneGeometry(st.exit.w, st.exit.h).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x66ddff, transparent: true, opacity: 0.4 }),
    );
    exit.position.set(st.exit.x + st.exit.w / 2, 0.03, st.exit.z + st.exit.h / 2);
    scene.add(exit);

    // 木
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5636, flatShading: true });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, flatShading: true });
    for (const o of st.obstacles) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.8, o.r, 5, 6), trunkMat);
      trunk.position.set(o.pos.x, 2.5, o.pos.z);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 7), leafMat);
      leaf.position.set(o.pos.x, 6.5, o.pos.z);
      scene.add(trunk, leaf);
    }

    // 主人公
    this.heroMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a7bd5, flatShading: true }),
    );
    scene.add(this.heroMesh);

    // アンカーのワイヤー
    this.wire = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    this.wire.visible = false;
    this.wire.frustumCulled = false;
    scene.add(this.wire);

    for (const s of w.soldiers) {
      const m = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.3, 0.8, 4, 8),
        new THREE.MeshStandardMaterial({ color: s.isCaptain ? 0xe6c04a : 0x58b368, flatShading: true }),
      );
      this.soldierMeshes.set(s.id, m);
      scene.add(m);
    }
  }

  private sector(half: number): THREE.BufferGeometry {
    const key = Math.round(half * 1000);
    let g = this.sectorGeo.get(key);
    if (!g) {
      g = half >= Math.PI - 1e-6
        ? new THREE.CircleGeometry(1, 40)
        : new THREE.CircleGeometry(1, 24, -half, half * 2);
      g.rotateX(-Math.PI / 2);
      this.sectorGeo.set(key, g);
    }
    return g;
  }

  render(w: CombatWorld): void {
    // 主人公
    const h = w.hero;
    this.heroMesh.position.set(h.pos.x, 0.8, h.pos.z);
    const hs = h.state.kind;
    this.heroMesh.visible = hs !== 'down';
    this.heroMesh.scale.y = hs === 'dodging' ? 0.6 : 1;
    (this.heroMesh.material as THREE.MeshStandardMaterial).color.setHex(
      hs === 'stunned' ? 0xb0b0ff : hs === 'mounted' ? 0x8ad0ff : 0x3a7bd5);
    if (hs === 'mounted') this.heroMesh.position.y = 3;
    if (hs === 'reeling') {
      this.heroMesh.position.y = 1.8;
      const t = h.state as { target: { kind: string; pos?: { x: number; z: number }; titanId?: string } };
      let dest = t.target.pos ?? null;
      if (t.target.kind === 'titan') {
        const tt = w.titans.find((x) => x.id === t.target.titanId);
        if (tt) dest = partPos(tt, 'nape');
      }
      if (dest) {
        const arr = this.wire.geometry.attributes.position as THREE.BufferAttribute;
        arr.setXYZ(0, h.pos.x, 1.8, h.pos.z);
        arr.setXYZ(1, dest.x, 3, dest.z);
        arr.needsUpdate = true;
        this.wire.visible = true;
      }
    } else this.wire.visible = false;

    // 隊員
    for (const s of w.soldiers) this.updateSoldier(s);

    // 巨人
    const seen = new Set<string>();
    for (const t of w.titans) {
      seen.add(t.id);
      let v = this.titanViews.get(t.id);
      if (!v) { v = new TitanView(t); this.titanViews.set(t.id, v); this.scene.add(v.group); }
      v.update(t, isInNapeZone(h.pos, t) && h.state.kind !== 'down');
      this.updateTelegraph(t);
    }
    for (const [id, v] of this.titanViews) {
      if (!seen.has(id)) {
        this.scene.remove(v.group); this.titanViews.delete(id);
        const tg = this.telegraph.get(id);
        if (tg) tg.visible = false;
      }
    }
  }

  private updateSoldier(s: SoldierEntity): void {
    const m = this.soldierMeshes.get(s.id)!;
    m.position.set(s.pos.x, 0.7, s.pos.z);
    m.rotation.set(0, 0, 0);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (s.state.kind === 'down') {
      m.rotation.z = Math.PI / 2; m.position.y = 0.3; mat.color.setHex(0x808080);
    } else if (s.state.kind === 'grabbed') {
      m.position.y = 3; mat.color.setHex(0xff7070);
    } else {
      mat.color.setHex(s.isCaptain ? 0xe6c04a : 0x58b368);
      if (s.state.kind === 'evade') m.position.y = 0.45;
    }
  }

  private updateTelegraph(t: TitanEntity): void {
    let mesh = this.telegraph.get(t.id);
    if (!mesh) {
      mesh = new THREE.Mesh(
        this.sector(C.grabHalf),
        new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.4, depthWrite: false }),
      );
      mesh.position.y = 0.06;
      this.scene.add(mesh);
      this.telegraph.set(t.id, mesh);
      this.disposables.push(mesh.material as THREE.Material);
    }
    if (t.state.kind !== 'windup') { mesh.visible = false; return; }
    const z = attackZone(t, t.state.attack);
    mesh.geometry = this.sector(z.half);
    mesh.visible = true;
    mesh.position.x = t.pos.x; mesh.position.z = t.pos.z;
    mesh.rotation.y = -t.facing;
    mesh.scale.set(z.r, 1, z.r);
    const need = C.windupTime * (t.kind === 'abnormal' ? C.abnormalWindupMul : 1);
    (mesh.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * Math.min(1, t.state.t / need);
  }

  dispose(): void {
    for (const g of this.sectorGeo.values()) g.dispose();
    for (const d of this.disposables) d.dispose();
  }
}

class TitanView {
  group = new THREE.Group();
  private body: THREE.Mesh;
  private markers = {} as Record<'legL' | 'legR' | 'armL' | 'armR' | 'nape', THREE.Mesh>;
  private baseColor: number;

  constructor(t: TitanEntity) {
    this.baseColor = KIND_COLOR[t.kind];
    const r = bodyR(t.size);
    const h = t.size * 0.6;
    this.body = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.9, r, h, 8),
      new THREE.MeshStandardMaterial({ color: this.baseColor, flatShading: true }),
    );
    this.body.position.y = h / 2;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.6, 8, 6),
      new THREE.MeshStandardMaterial({ color: this.baseColor, flatShading: true }),
    );
    head.position.set(r * 0.2, h + r * 0.4, 0);
    this.group.add(this.body, head);

    const mk = (x: number, y: number, z: number, color: number) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.25, t.size * 0.035), 6, 5),
        new THREE.MeshStandardMaterial({ color, emissive: 0x000000 }),
      );
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    // ローカル座標：+x が前、+z が「右」側（partPosのsideと一致）
    this.markers.legL = mk(0, 0.4, -r * 0.7, 0x2255cc);
    this.markers.legR = mk(0, 0.4, r * 0.7, 0x2255cc);
    this.markers.armL = mk(r, h * 0.65, -r, 0x22aa55);
    this.markers.armR = mk(r, h * 0.65, r, 0x22aa55);
    this.markers.nape = mk(-r * 0.8, h * 0.85, 0, 0xffee55);
  }

  update(t: TitanEntity, napeGlow: boolean): void {
    this.group.position.set(t.pos.x, 0, t.pos.z);
    this.group.rotation.y = -t.facing;
    const k = t.state.kind;
    let sy = 1;
    if (k === 'kneel') sy = 0.75;
    if (k === 'dying') sy = Math.max(0.05, 1 - t.state.t / C.dyingTime);
    this.group.scale.y = sy;
    (this.body.material as THREE.MeshStandardMaterial).color.setHex(
      k === 'windup' ? 0xe08080 : k === 'dying' ? 0x808080 : this.baseColor);
    for (const id of ['legL', 'legR', 'armL', 'armR'] as const) {
      const m = this.markers[id];
      const p = t.parts[id];
      (m.material as THREE.MeshStandardMaterial).color.setHex(p.broken ? 0xdd2222 : id.startsWith('leg') ? 0x2255cc : 0x22aa55);
      m.scale.setScalar(p.broken ? 1.4 : 1);
    }
    const nm = this.markers.nape.material as THREE.MeshStandardMaterial;
    nm.emissive.setHex(napeGlow && k !== 'dying' ? 0xffcc00 : 0x000000);
    this.markers.nape.scale.setScalar(napeGlow ? 1.6 : 1);
  }
}
