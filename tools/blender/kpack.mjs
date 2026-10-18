// Pack the baked kitchen for the web: drop maps the unlit shading never reads, shrink textures to webp,
// compress geometry, and convert the separate lightmaps.
// usage: node kpack.mjs <bake_dir> <out_dir>   (run where @gltf-transform, sharp and meshoptimizer resolve)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(path.join(src, 'kitchen.glb'));

// Anchor empties (camera targets, board faces) don't survive geometry compression; ship them as JSON.
const anchors = {};
for (const n of doc.getRoot().listNodes()) if (!n.getMesh() && /^(anchor|board)_/.test(n.getName())) anchors[n.getName()] = { p: n.getTranslation(), ...n.getExtras() };
fs.writeFileSync(path.join(out, 'anchors.json'), JSON.stringify(anchors));

for (const m of doc.getRoot().listMaterials()) {
  m.setNormalTexture(null).setMetallicRoughnessTexture(null).setEmissiveTexture(null).setOcclusionTexture(null);
}
await doc.transform(
  dedup(), prune({ keepAttributes: true, keepLeaves: true, keepExtras: true }), weld({ tolerance: 0.0001 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 86, slots: /baseColor/, pattern: /_color|_steel|_logo|board/, resize: [2048, 2048] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [1024, 1024] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
await io.write(path.join(out, 'kitchen.glb'), doc);

// Lightmaps (and the tree billboard) ship as separate webp files.
for (const f of fs.readdirSync(src)) {
  if (!/_(tile|leaf)\.png$/.test(f)) continue;
  await sharp(path.join(src, f)).webp({ quality: 88 }).toFile(path.join(out, f.replace('.png', '.webp')));
}
let total = 0;
for (const f of fs.readdirSync(out)) { const s = fs.statSync(path.join(out, f)).size; total += s; console.log(f, (s / 1024).toFixed(0) + ' KB'); }
console.log('total', (total / 1024 / 1024).toFixed(2) + ' MB');
