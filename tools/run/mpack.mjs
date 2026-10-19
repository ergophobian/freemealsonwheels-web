// Pack the MetaHuman cast for the web (after mh_anim.py): hair cards get a real RGBA texture (cast hair colour,
// strand coverage as alpha), outfits take the cast's colours, textures go to webp at web sizes, geometry to meshopt.
// usage: node mpack.mjs <in_dir> <out_dir> [cast.json]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
const [src, out, castPath = new URL('../blender/mh_cast.json', import.meta.url).pathname] = process.argv.slice(2);
const CAST = Object.fromEntries(JSON.parse(fs.readFileSync(castPath, 'utf8')).map((p) => [p.id, p]));
fs.mkdirSync(out, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const lin = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16) / 255).map((c) => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));

for (const f of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const id = f.replace(/\.glb$/, ''), spec = CAST[id] ?? {};
  const doc = await io.read(path.join(src, f)), root = doc.getRoot();
  for (const a of root.listAnimations()) if (/TPose|_ual$/.test(a.getName())) a.dispose();
  for (const m of root.listMaterials()) {
    const n = m.getName();
    m.setMetallicRoughnessTexture(null).setOcclusionTexture(null).setMetallicFactor(0);
    if (!/Face_Skin/.test(n)) m.setNormalTexture(null);
    if (/CardsMesh/.test(n)) {
      // Strand coverage lives in the red channel of the card atlas: turn it into alpha over a flat hair colour.
      const t = m.getBaseColorTexture(); if (!t) continue;
      const brows = /Eyebrow/.test(n), size = brows ? 512 : 1024;
      const cov = await sharp(Buffer.from(t.getImage())).extractChannel(0).resize(size, size).toBuffer();
      const [r, g, b] = (spec.hair_col ? lin(spec.hair_col) : [.03, .02, .015]).map((c) => Math.round(Math.min(1, c ** (1 / 2.2) * (brows ? .8 : 1)) * 255));
      const png = await sharp({ create: { width: size, height: size, channels: 3, background: { r, g, b } } }).joinChannel(cov).png().toBuffer();
      t.setImage(new Uint8Array(png)).setMimeType('image/png').setName(n + '_rgba');
      m.setBaseColorFactor([1, 1, 1, 1]).setAlphaMode('MASK').setAlphaCutoff(.35).setDoubleSided(true).setRoughnessFactor(.5);
    } else if (/Garment.*Shirt/.test(n) && spec.top_col) m.setBaseColorFactor([...lin(spec.top_col), 1]);
    else if (/Garment.*Short/.test(n) && spec.bottom_col) m.setBaseColorFactor([...lin(spec.bottom_col), 1]);
    else m.setAlphaMode('OPAQUE');
  }
  await doc.transform(
    dedup(), prune({ keepAttributes: false }), weld({ tolerance: .0001 }), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 85, resize: [1024, 1024], pattern: /Face_Skin|CardsMesh.*Hair|_rgba/i }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 80, resize: [512, 512] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(path.join(out, f), doc);
  const tris = root.listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0);
  console.log(f, (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB', Math.round(tris) + ' tris', root.listAnimations().map((a) => a.getName()).join(','));
}
