import * as THREE from 'three';
import { COMBAT as C } from '../config/combat';
import type { Vec2 } from '../state/types';

/** ヒットストップ・スロー・画面の揺れ・土煙 */
export class Effects {
  private hitStopT = 0;
  private slowT = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private dust: { mesh: THREE.Mesh; t: number; life: number }[] = [];
  private mat = new THREE.MeshBasicMaterial({ color: 0xcdbfa6, transparent: true, depthWrite: false });
  private geo = new THREE.SphereGeometry(1, 8, 6);

  constructor(private scene: THREE.Scene) {}

  hitStop(sec: number = C.hitStop): void { this.hitStopT = Math.max(this.hitStopT, sec); }
  slowMo(sec: number = C.slowMoTime): void { this.slowT = Math.max(this.slowT, sec); }
  shake(amp: number = C.shakeAmp, sec: number = C.shakeFxTime): void { this.shakeT = sec; this.shakeAmp = amp; }

  /** 実時間dtを、ゲーム内で進める時間に変える。0ならロジックを止める */
  scaleDt(dt: number): number {
    if (this.hitStopT > 0) { this.hitStopT -= dt; return 0; }
    if (this.slowT > 0) { this.slowT -= dt; return dt * C.slowMoScale; }
    return dt;
  }

  shakeOffset(): { x: number; z: number } {
    if (this.shakeT <= 0) return { x: 0, z: 0 };
    const k = this.shakeT / C.shakeFxTime;
    return { x: (Math.random() - 0.5) * this.shakeAmp * 2 * k, z: (Math.random() - 0.5) * this.shakeAmp * 2 * k };
  }

  puffDust(pos: Vec2, radius: number): void {
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(this.geo, this.mat.clone());
      const a = (i / 8) * Math.PI * 2;
      m.position.set(pos.x + Math.cos(a) * radius, 0.4, pos.z + Math.sin(a) * radius);
      m.scale.setScalar(0.4);
      this.scene.add(m);
      this.dust.push({ mesh: m, t: 0, life: 1 });
    }
  }

  /** 実時間で進める */
  update(dt: number): void {
    if (this.shakeT > 0) this.shakeT -= dt;
    for (const d of this.dust) {
      d.t += dt;
      const k = d.t / d.life;
      d.mesh.scale.setScalar(0.4 + k * 1.6);
      d.mesh.position.y = 0.4 + k * 1.2;
      (d.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 * (1 - k));
    }
    this.dust = this.dust.filter((d) => {
      if (d.t < d.life) return true;
      this.scene.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
      return false;
    });
  }

  dispose(): void { this.geo.dispose(); this.mat.dispose(); }
}
