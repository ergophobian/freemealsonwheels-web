// Loads the Blender-baked kitchen street and gives every surface its cheap unlit material.
// Colour-baked meshes show their atlas as is; photo-textured meshes multiply a tiling texture by a lightmap.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export interface Baked {
  root: THREE.Group;
  anchors: Record<string, THREE.Object3D>;
  boards: Record<string, { obj: THREE.Object3D; w: number; h: number }>;
  steel: THREE.MeshBasicMaterial[];
  glass: THREE.MeshStandardMaterial[];
}

export async function loadBaked(dir: string, renderer: THREE.WebGLRenderer): Promise<Baked> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [gltf, marks] = await Promise.all([
    loader.loadAsync(`${dir}/kitchen.glb`),
    fetch(`${dir}/anchors.json`).then((r) => r.json() as Promise<Record<string, { p: [number, number, number]; w?: number; h?: number }>>).catch(() => ({})),
  ]);
  for (const [name, m] of Object.entries(marks)) { const o = new THREE.Object3D(); o.name = name; o.position.fromArray(m.p); o.userData = { w: m.w, h: m.h }; gltf.scene.add(o); }
  const tex = new THREE.TextureLoader();
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const lightmaps = new Map<string, Promise<THREE.Texture>>();
  const lightmap = (file: string) => {
    const name = file.replace('.png', '.webp');
    if (!lightmaps.has(name)) lightmaps.set(name, tex.loadAsync(`${dir}/${name}`).then((t) => {
      t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.channel = 1; return t;
    }));
    return lightmaps.get(name)!;
  };
  const anchors: Baked['anchors'] = {}, boards: Baked['boards'] = {}, steel: THREE.MeshBasicMaterial[] = [], glass: THREE.MeshStandardMaterial[] = [];
  const jobs: Promise<void>[] = [];

  gltf.scene.traverse((o) => {
    if (o.name.startsWith('anchor_')) anchors[o.name.slice(7)] = o;
    if (o.name.startsWith('board_')) boards[o.name.slice(6)] = { obj: o, w: o.userData.w, h: o.userData.h };
    const info = o.userData as { bake?: string; scale?: number; image?: string; billboard?: number };
    if (!info.bake && !info.billboard && !(o as THREE.Mesh).isMesh) return;
    const meshes: THREE.Mesh[] = [];
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    else o.children.forEach((c) => (c as THREE.Mesh).isMesh && meshes.push(c as THREE.Mesh));
    const kind = info.bake ?? (info.billboard ? 'billboard' : '');
    for (const m of meshes) {
      if (m.userData.done) continue; m.userData.done = true;
      const src = m.material as THREE.MeshStandardMaterial;
      m.matrixAutoUpdate = false; m.updateMatrix();
      if (src.name === 'Glass' || /glass/.test(m.parent?.name ?? '') || /_glass/.test(o.name)) {
        // Glass reflects the sky (set once the sky texture arrives) and lets the rooms behind show through.
        const g = new THREE.MeshStandardMaterial({ color: '#dde8ee', metalness: 1, roughness: .04, transparent: true, opacity: .42, depthWrite: false, envMapIntensity: .9 });
        glass.push(g); m.material = g;
        m.renderOrder = 2; continue;
      }
      if (kind === 'billboard') {
        if (src.map) src.map.anisotropy = maxAniso;
        m.material = new THREE.MeshBasicMaterial({ map: src.map, alphaTest: .45, side: THREE.DoubleSide, color: new THREE.Color(1, 1, 1).multiplyScalar(.82) });
        continue;
      }
      if (kind === 'emit') {
        const c = src.emissive.clone().multiplyScalar(Math.min(2.5, Math.max(.6, src.emissiveIntensity ?? 1)));
        m.material = new THREE.MeshBasicMaterial({ color: c.r + c.g + c.b > .1 ? c : src.color });
        continue;
      }
      const scale = info.scale ?? 1;
      if (kind === 'vcol') {
        m.material = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(scale, scale, scale) });
        continue;
      }
      if (kind === 'color' || kind === 'steel') {
        const mat = new THREE.MeshBasicMaterial({ map: src.map, color: new THREE.Color(scale, scale, scale) });
        if (src.map) src.map.anisotropy = maxAniso;
        if (kind === 'steel') steel.push(mat);
        m.material = mat; continue;
      }
      if (kind === 'tile' || kind === 'leaf') {
        const tint = new THREE.Color((src.userData?.tint as string) ?? '#ffffff');
        const mat = new THREE.MeshBasicMaterial({
          map: src.map, color: src.color.clone().multiply(tint),
          lightMapIntensity: scale * Math.PI,
          alphaTest: kind === 'leaf' ? .45 : 0, side: kind === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
          transparent: false,
        });
        if (src.map) { src.map.anisotropy = maxAniso; src.map.wrapS = src.map.wrapT = THREE.RepeatWrapping; }
        m.material = mat;
        if (info.image) jobs.push(lightmap(info.image).then((t) => { mat.lightMap = t; mat.needsUpdate = true; }));
      }
    }
  });
  await Promise.all(jobs);
  return { root: gltf.scene, anchors, boards, steel, glass };
}
