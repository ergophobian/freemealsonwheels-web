# Assemble one MetaHuman export for the web: fix the face material mix-up from UE's glTF exporter,
# apply the clean DCC textures, attach hair cards, then render previews (and optionally export a GLB).
import bpy, sys, math, os, bmesh
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]
NAME, GLB, DCC, CARDTEX, OUT = a[0], a[1], a[2], a[3], a[4]
EXPORT = len(a) > 5 and a[5] == 'export'
import json
SPEC = next((p for p in json.load(open(r'C:\fmow\mhp\cast_look.json')) if p['id'] == NAME), {})
def lin(h): h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]; return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c) + (1,)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

def imp(p):
    before = set(sc.objects); bpy.ops.import_scene.gltf(filepath=p); return [o for o in sc.objects if o not in before]
main = imp(os.path.join(GLB, NAME + '.glb'))
cards = []
for f in sorted(os.listdir(GLB)):
    if f.startswith(NAME + '__') and f.endswith('.glb'): cards += imp(os.path.join(GLB, f))
for o in list(sc.objects):
    if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)

def img(n, colour=True):
    p = os.path.join(DCC, 'Maps', n)
    if not os.path.exists(p): print('MISSING', p); return None
    i = bpy.data.images.load(p); i.colorspace_settings.name = 'sRGB' if colour else 'Non-Color'; return i

def pbr(name, bc=None, nrm=None, rough=.55, spec=.35, alpha=None, sss=0.):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough; b.inputs['Specular IOR Level'].default_value = spec
    if bc:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bc; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha: nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
    if nrm:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = nrm; nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = .8
        nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss; b.inputs['Subsurface Radius'].default_value = (1., .35, .2); b.inputs['Subsurface Scale'].default_value = .006
    return m

SKIN = pbr('Skin', img('Head_Basecolor.png'), img('Head_Normal.png', False), .5, .4, sss=.25)
BODY = pbr('BodySkin', img('Body_Basecolor.png'), img('Body_Normal.png', False), .55, .35, sss=.2)
EYE = pbr('Eye', img('Eyes_Color.png'), None, .05, .5)
TEETH = pbr('Teeth', img('Teeth_Color.png'), None, .35, .4)

face = next(o for o in sc.objects if o.type == 'MESH' and 'FaceMesh' in o.name)
body = next((o for o in sc.objects if o.type == 'MESH' and 'BodyMesh' in o.name), None)
pass  # the body's own baked material from UE is correct

# Group the face polygons by their (scrambled) material slot and classify each group by shape.
me = face.data; mw = face.matrix_world
groups = {}
for p in me.polygons: groups.setdefault(p.material_index, []).append(p)
info = []
for k, ps in groups.items():
    vs = {v for p in ps for v in p.vertices}; pts = [mw @ me.vertices[v].co for v in vs]
    lo = Vector((min(q.x for q in pts), min(q.y for q in pts), min(q.z for q in pts))); hi = Vector((max(q.x for q in pts), max(q.y for q in pts), max(q.z for q in pts)))
    info.append((k, len(vs), (lo + hi) / 2, hi - lo))
skin_k = max(info, key=lambda i: i[1])[0]
sk = next(i for i in info if i[0] == skin_k)
head_c, head_s = sk[2], sk[3]
role = {}
for k, n, c, s in info:
    if k == skin_k: role[k] = 'skin'; continue
    size = max(s); rel = c - head_c
    if .018 < size < .032 and abs(s.x - s.z) < .008 and abs(s.y - s.z) < .012: role[k] = 'eye'
    elif size > .035 and abs(rel.x) < .01 and c.z < head_c.z: role[k] = 'teeth'
    else: role[k] = 'hide'
print('FACE GROUPS', [(k, n, tuple(round(x, 3) for x in c), tuple(round(x, 3) for x in s), role[k]) for k, n, c, s in info])
# UE's exporter shifted the material list, but its baked textures are right: re-pair them by name.
own = {m.name: m for m in me.materials if m}
pick = lambda key, fb: next((m for n, m in own.items() if key in n), fb)
for k, n, c, sz in info:
    if role[k] == 'eye': role[k] = 'eyeL' if c.x > 0 else 'eyeR'
mats = {'skin': pick('Skin', SKIN), 'eyeL': pick('EyeR', EYE), 'eyeR': pick('EyeR', EYE), 'teeth': pick('Teeth', TEETH)}
for m in mats.values():
    b = m.node_tree.nodes.get('Principled BSDF') if m.use_nodes else None
    if b and m is mats['skin']: b.inputs['Subsurface Weight'].default_value = .2; b.inputs['Subsurface Radius'].default_value = (1., .35, .2); b.inputs['Subsurface Scale'].default_value = .006
print('PAIR', {k: v.name for k, v in mats.items()})
order = ['skin', 'eyeL', 'eyeR', 'teeth']
# Read each face's original slot before touching the material list (clearing it resets the indices).
bm = bmesh.new(); bm.from_mesh(me)
kill = []
for f in bm.faces:
    r = role.get(f.material_index, 'hide')
    if r == 'hide': kill.append(f)
    else: f.material_index = order.index(r)
me.materials.clear()
for r in order: me.materials.append(mats[r])
# Eyelash strips come through welded into the skin section as small loose islands: drop those.
skin_faces = {f for f in bm.faces if f.material_index == 0 and f not in set(kill)}
seen = set(); islands = []
for f in skin_faces:
    if f in seen: continue
    stack = [f]; isl = []; seen.add(f)
    while stack:
        g = stack.pop(); isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h in skin_faces and h not in seen: seen.add(h); stack.append(h)
    islands.append(isl)
islands.sort(key=len, reverse=True)
print('SKIN ISLANDS', [len(i) for i in islands[:12]], len(islands))
for isl in islands[1:]:
    if len(isl) < .05 * len(islands[0]): kill += isl
bmesh.ops.delete(bm, geom=list(set(kill)), context='FACES'); bm.to_mesh(me); bm.free()
from collections import Counter
print('AFTER', Counter(p.material_index for p in me.polygons), [m.name for m in me.materials])
for m in me.materials:
    if m and m.use_nodes: print('NODES', m.name, [(n.type, getattr(getattr(n, 'image', None), 'name', '')) for n in m.node_tree.nodes], [(l.from_node.type, l.from_socket.name, l.to_socket.name) for l in m.node_tree.links])

# Hair cards: colour from the groom's melanin, alpha from the card coverage texture.
def ctex(*keys):
    if not os.path.isdir(CARDTEX): return None
    for f in sorted(os.listdir(CARDTEX)):
        if all(k.lower() in f.lower() for k in keys): return os.path.join(CARDTEX, f)
for o in cards:
    grp = 'Eyebrows' if 'Eyebrow' in o.name else 'Hair'
    m = bpy.data.materials.new(o.name + '_m'); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    hc = lin(SPEC.get('hair_col', '#2B1E16')); b.inputs['Base Color'].default_value = hc if grp == 'Hair' else tuple(x * .8 for x in hc[:3]) + (1,)
    b.inputs['Roughness'].default_value = .45; b.inputs['Specular IOR Level'].default_value = .5
    cov = ctex(o.name.split('_CardsMesh')[0], 'CardsAtlas_Attribute')
    if cov:
        # Red channel of the card atlas is the strand coverage: use it as the cut-out.
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(cov); t.image.colorspace_settings.name = 'Non-Color'
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(t.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Red'], b.inputs['Alpha']); print('CARD ALPHA', o.name, cov)
    else: print('CARD NO ALPHA', o.name)
    o.data.materials.clear(); o.data.materials.append(m)

# Outfit colours: tint the garment's own baked texture.
for o in [o for o in sc.objects if o.type == 'MESH' and 'Outfit' in o.name]:
    for m in o.data.materials:
        if not m or not m.use_nodes: continue
        col = SPEC.get('top_col') if 'Shirt' in m.name else SPEC.get('bottom_col')
        if not col: continue
        b = m.node_tree.nodes.get('Principled BSDF'); inp = b.inputs['Base Color']; L = m.node_tree.links
        mix = m.node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        if inp.is_linked: src = inp.links[0].from_socket; L.remove(inp.links[0]); L.new(src, mix.inputs['A'])
        mix.inputs['B'].default_value = lin(col); L.new(mix.outputs['Result'], inp)

# Previews.
ms = [o for o in sc.objects if o.type == 'MESH']
pts = [o.matrix_world @ Vector(c) for o in ms for c in o.bound_box]
top = max(p.z for p in pts); bot = min(p.z for p in pts); H = top - bot
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
env = w.node_tree.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(r'C:\fmow\sky.hdr')
w.node_tree.links.new(env.outputs[0], w.node_tree.nodes['Background'].inputs[0]); w.node_tree.nodes['Background'].inputs[1].default_value = .8
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.data.color = (1, .88, .74); sun.data.angle = math.radians(4); sc.collection.objects.link(sun)
sun.rotation_euler = (math.radians(55), 0, math.radians(-35))
fl = bpy.data.objects.new('floor', bpy.data.meshes.new('floor')); sc.collection.objects.link(fl)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4); bm.to_mesh(fl.data); bm.free(); fl.location.z = bot
fl.data.materials.append(pbr('Floor', None, None, .8)); fl.data.materials[0].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.35, .3, .26, 1)
sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
try:
    p = bpy.context.preferences.addons['cycles'].preferences; p.compute_device_type = 'OPTIX'; p.get_devices()
    for d in p.devices: d.use = d.type == 'OPTIX'
    sc.cycles.device = 'GPU'
except Exception as e: print(e)
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Punchy'
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
fc = head_c
# Characters face -Y after the glTF import; shots from the front-left.
for name, tgt, dist, lens, yaw, res in [('face', fc, .62, 85, -25, (900, 900)), ('eyes', Vector((fc.x, fc.y - .05, fc.z + .07)), .3, 85, -10, (900, 500)), ('body', Vector((fc.x, fc.y, bot + H * .52)), 3.2, 50, -20, (700, 1000))]:
    r = math.radians(yaw); cam.location = Vector((tgt.x + math.sin(r) * dist, tgt.y - math.cos(r) * dist, tgt.z + (.02 if name == 'face' else .15)))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = lens
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = os.path.join(OUT, f'{NAME}_{name}.png'); bpy.ops.render.render(write_still=True)
if EXPORT:
    bpy.data.objects.remove(fl); bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, NAME + '.glb'), export_format='GLB', export_animations=False)
