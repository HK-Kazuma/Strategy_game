import * as THREE from 'three';
import type { Vec2 } from '../state/types';

export interface Renderer3D {
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  resize(): void;
}

const VIEW_WIDTH = 30;        // 画面の横幅（メートル）
const AZIMUTH = Math.PI / 4;  // 方位45°
const ELEVATION = (55 * Math.PI) / 180; // 俯角55°
const CAM_DIST = 60;

export function createRenderer(container: HTMLElement): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    const aspect = w / h;
    camera.left = -VIEW_WIDTH / 2;
    camera.right = VIEW_WIDTH / 2;
    camera.top = VIEW_WIDTH / 2 / aspect;
    camera.bottom = -VIEW_WIDTH / 2 / aspect;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();
  return { renderer, camera, resize };
}

/** 追従カメラ。画面の上が世界の(+x,+z)になる向き */
export function placeCamera(camera: THREE.OrthographicCamera, target: Vec2, shake = { x: 0, z: 0 }): void {
  const c = Math.cos(ELEVATION), s = Math.sin(ELEVATION);
  const ox = -c * Math.cos(AZIMUTH) * CAM_DIST;
  const oz = -c * Math.sin(AZIMUTH) * CAM_DIST;
  camera.position.set(target.x + ox + shake.x, s * CAM_DIST, target.z + oz + shake.z);
  camera.lookAt(target.x + shake.x, 0, target.z + shake.z);
  camera.updateMatrixWorld();
}

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();

/** 画面上の点（NDC）→ 地面座標 */
export function groundPoint(camera: THREE.OrthographicCamera, ndcX: number, ndcY: number): Vec2 | null {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
