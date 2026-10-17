// CC0 food models from Kenney's Food Kit (kenney.nl), loaded once and cloned.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const FOODS = ['bowl-soup', 'bowl-broth', 'plate-dinner', 'salad', 'loaf-round', 'apple', 'orange', 'mug', 'cup-tea', 'pot-stew', 'sandwich', 'styrofoam-dinner', 'utensil-spoon', 'pie', 'pumpkin-basic', 'carrot', 'cabbage', 'tomato', 'corn', 'rice-ball'] as const;
export type FoodId = typeof FOODS[number];

const loader = new GLTFLoader();
const load = (url: string) => new Promise<THREE.Group>((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej));

export async function loadFood(base = '/models/food') {
  const scenes = await Promise.all(FOODS.map((f) => load(`${base}/${f}.glb`)));
  for (const s of scenes) s.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  const box = new THREE.Box3(), size = new THREE.Vector3();
  return (id: FoodId, s = 1) => {
    const o = scenes[FOODS.indexOf(id)].clone();
    if (s !== 1) { box.setFromObject(o).getSize(size); o.scale.setScalar(s / Math.max(size.x, size.y, size.z)); }
    return o;
  };
}
