// Pack the MakeHuman cast for the web: 512px webp textures (1024 for skin), simplified meshes, meshopt geometry.
// usage: node ppack.mjs <in_dir> <out_dir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, simplify, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [src, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready; await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(src, f));
  for (const m of doc.getRoot().listMaterials()) m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setNormalTexture(null);
  await doc.transform(
    dedup(), prune({ keepAttributes: false }), weld({ tolerance: .0001 }), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [1024, 1024], pattern: /skin|body|litsphere|diffuse/i }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [512, 512] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(out, f), doc);
  const tris = doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB', Math.round(tris) + ' tris');
}
