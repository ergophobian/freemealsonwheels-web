// CC0 models from Kenney (kenney.nl): Mini Characters and Food Kit.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export const CHARACTERS = ['female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f', 'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f'] as const;
export const FOODS = ['bowl-soup', 'bowl-broth', 'plate-dinner', 'salad', 'loaf-round', 'apple', 'orange', 'mug', 'cup-tea', 'pot-stew', 'sandwich', 'styrofoam-dinner', 'utensil-spoon', 'pie', 'pumpkin-basic', 'carrot', 'cabbage', 'tomato', 'corn', 'rice-ball'] as const;
export type CharacterId = typeof CHARACTERS[number];
export type FoodId = typeof FOODS[number];

const loader = new GLTFLoader();
const load = (url: string) => new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((res, rej) => loader.load(url, res, undefined, rej));

export interface Assets {
  characters: readonly CharacterId[];
  character(id: CharacterId): { obj: THREE.Object3D; clips: THREE.AnimationClip[] };
  food(id: FoodId, size?: number): THREE.Object3D;
  wheelchair(): THREE.Object3D;
  cane(): THREE.Object3D;
}

function prep(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace; }
  });
}

export async function loadAssets(base = '/models', characters: readonly CharacterId[] = CHARACTERS): Promise<Assets> {
  const [chars, foods, chair, cane] = await Promise.all([
    Promise.all(characters.map((c) => load(`${base}/chars/character-${c}.glb`))),
    Promise.all(FOODS.map((f) => load(`${base}/food/${f}.glb`))),
    load(`${base}/chars/wheelchair.glb`),
    load(`${base}/chars/aid-cane.glb`),
  ]);
  chars.forEach((g) => prep(g.scene)); foods.forEach((g) => prep(g.scene)); prep(chair.scene); prep(cane.scene);
  const box = new THREE.Box3(), size = new THREE.Vector3();
  return {
    characters,
    character(id) {
      const g = chars[characters.indexOf(id)];
      const obj = cloneSkinned(g.scene);
      return { obj, clips: g.animations };
    },
    food(id, s = 1) {
      const o = foods[FOODS.indexOf(id)].scene.clone();
      if (s !== 1) { box.setFromObject(o).getSize(size); o.scale.setScalar(s / Math.max(size.x, size.y, size.z)); }
      return o;
    },
    wheelchair() { return chair.scene.clone(); },
    cane() { return cane.scene.clone(); },
  };
}
