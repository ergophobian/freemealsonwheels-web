# Free Meals on Wheels community kitchen: the building, the kitchen inside, and the hand-out out front.
# Built headless:  blender -b --factory-startup -P kitchen.py -- <out_dir> <render|bake> [logo.png]
# Coordinates are written in three.js terms (x right, y up, z toward the viewer); T() converts to Blender.
import bpy, bmesh, math, sys, os, random
from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
MODE = ARGS[1] if len(ARGS) > 1 else 'render'
LOGO = ARGS[2] if len(ARGS) > 2 else None
os.makedirs(OUT, exist_ok=True)
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
GROUPS = {}          # bake group -> objects
GROUP = ['shell']    # current group

def group(name): GROUP[0] = name

def T(x, y, z): return Vector((x, -z, y))

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

# ---------- materials
def principled(m):
    return m.node_tree.nodes['Principled BSDF']

def mat(name, color, rough=.6, metal=0., emit=None, strength=1.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = principled(m)
    b.inputs['Base Color'].default_value = (*srgb(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*srgb(emit), 1); b.inputs['Emission Strength'].default_value = strength
    return m

def wall_uv(nt, scale=1.):
    # Planar coordinates that follow whichever way a face points, so bricks and tiles line up on every wall and floor.
    n = nt.nodes; L = nt.links
    g = n.new('ShaderNodeNewGeometry')
    sp = n.new('ShaderNodeSeparateXYZ'); L.new(g.outputs['Position'], sp.inputs[0])
    sn = n.new('ShaderNodeSeparateXYZ'); L.new(g.outputs['Normal'], sn.inputs[0])
    def op(kind, a, b=None):
        m = n.new('ShaderNodeMath'); m.operation = kind
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = v
            else: L.new(v, m.inputs[i])
        return m.outputs[0]
    ax, ay, az = op('ABSOLUTE', sn.outputs[0]), op('ABSOLUTE', sn.outputs[1]), op('ABSOLUTE', sn.outputs[2])
    u = op('ADD', op('ADD', op('MULTIPLY', sp.outputs[0], ay), op('MULTIPLY', sp.outputs[1], ax)), op('MULTIPLY', sp.outputs[0], az))
    v = op('ADD', op('MULTIPLY', sp.outputs[2], op('SUBTRACT', 1., az)), op('MULTIPLY', sp.outputs[1], az))
    c = n.new('ShaderNodeCombineXYZ'); L.new(op('MULTIPLY', u, scale), c.inputs[0]); L.new(op('MULTIPLY', v, scale), c.inputs[1])
    return c.outputs[0]

def noise_mix(nt, vec, a, b, scale=6., detail=6.):
    n = nt.nodes; L = nt.links
    nz = n.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail
    if vec is not None: L.new(vec, nz.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB'); L.new(nz.outputs['Fac'], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = .35; ramp.color_ramp.elements[1].position = .7
    ramp.color_ramp.elements[0].color = (*srgb(a), 1); ramp.color_ramp.elements[1].color = (*srgb(b), 1)
    return ramp.outputs[0]

def bricks(name, c1, c2, mortar, bw=.24, bh=.075, offset=.5, rough=.85, mortar_size=.008, vary='#000000'):
    m = mat(name, c1, rough); nt = m.node_tree; n = nt.nodes; L = nt.links
    br = n.new('ShaderNodeTexBrick'); L.new(wall_uv(nt), br.inputs['Vector'])
    br.offset = offset; br.inputs['Scale'].default_value = 1.
    br.inputs['Brick Width'].default_value = bw; br.inputs['Row Height'].default_value = bh
    br.inputs['Mortar Size'].default_value = mortar_size; br.inputs['Mortar Smooth'].default_value = .2
    br.inputs['Color1'].default_value = (*srgb(c1), 1); br.inputs['Color2'].default_value = (*srgb(c2), 1)
    br.inputs['Mortar'].default_value = (*srgb(mortar), 1); br.inputs['Bias'].default_value = 0
    # A little grime noise so no surface reads as a flat colour.
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = .25
    L.new(br.outputs['Color'], mix.inputs['A']); L.new(noise_mix(nt, None, '#B8B0A6', '#FFFFFF', 3.5), mix.inputs['B'])
    L.new(mix.outputs['Result'], principled(m).inputs['Base Color'])
    return m

def grime(name, a, b, rough=.7, scale=5., metal=0.):
    m = mat(name, a, rough, metal); nt = m.node_tree
    nt.links.new(noise_mix(nt, None, a, b, scale), principled(m).inputs['Base Color'])
    return m

def stripe_tex(name, a, b):
    # A crisp two-colour stripe image, used as a tiling photo-style texture so awnings stay sharp on the web.
    import numpy as np
    d = os.path.join(PH, 'tex', name); os.makedirs(d, exist_ok=True); p = os.path.join(d, 'diff.jpg')
    W = 512; img = bpy.data.images.new(name, W, 64)
    ca, cb = np.array([*srgb(a), 1]), np.array([*srgb(b), 1])
    row = np.array([ca if (x * 2 // W) % 2 == 0 else cb for x in range(W)])
    px = np.tile(row, (64, 1)).astype(np.float32)
    img.pixels.foreach_set(px.ravel()); img.filepath_raw = p; img.file_format = 'JPEG'; img.save()
    return name
def stripes(name, a, b, width=.5):
    m = mat(name, a, .8); nt = m.node_tree; n = nt.nodes; L = nt.links
    g = n.new('ShaderNodeNewGeometry'); sp = n.new('ShaderNodeSeparateXYZ'); L.new(g.outputs['Position'], sp.inputs[0])
    w = n.new('ShaderNodeMath'); w.operation = 'PINGPONG'; L.new(sp.outputs[0], w.inputs[0]); w.inputs[1].default_value = width
    s = n.new('ShaderNodeMath'); s.operation = 'GREATER_THAN'; L.new(w.outputs[0], s.inputs[0]); s.inputs[1].default_value = width / 2
    mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; L.new(s.outputs[0], mix.inputs['Factor'])
    mix.inputs['A'].default_value = (*srgb(a), 1); mix.inputs['B'].default_value = (*srgb(b), 1)
    L.new(mix.outputs['Result'], principled(m).inputs['Base Color'])
    return m


PH = os.environ.get('PH', r'C:\fmow\ph')
TILE = {}
def tiled(name, asset, tile, tint=None, rough=None, nstr=1.):
    # Photo-scanned Poly Haven surface on world-scaled box UVs (set in the final pass), so tiles keep real size.
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; n = nt.nodes; L = nt.links; b = principled(m)
    uv = n.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    def img(fn, color):
        p = os.path.join(PH, 'tex', asset, fn)
        if not os.path.exists(p): return None
        t = n.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p, check_existing=True)
        if not color: t.image.colorspace_settings.name = 'Non-Color'
        L.new(uv.outputs[0], t.inputs[0]); return t
    d = img('diff.jpg', True)
    if tint:
        mix = n.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
        L.new(d.outputs['Color'], mix.inputs['A']); mix.inputs['B'].default_value = (*srgb(tint), 1); L.new(mix.outputs['Result'], b.inputs['Base Color'])
    else: L.new(d.outputs['Color'], b.inputs['Base Color'])
    r = img('rough.jpg', False)
    if rough is not None: b.inputs['Roughness'].default_value = rough
    elif r: L.new(r.outputs['Color'], b.inputs['Roughness'])
    nm = img('nor.jpg', False)
    if nm:
        nmap = n.new('ShaderNodeNormalMap'); nmap.inputs['Strength'].default_value = nstr
        L.new(nm.outputs['Color'], nmap.inputs['Color']); L.new(nmap.outputs['Normal'], b.inputs['Normal'])
    TILE[m.name] = tile; m['tint'] = tint or '#FFFFFF'; m['tile_m'] = tile
    return m

BRICK = tiled('Brick', 'brick_wall_02', 2.2)
BRICK_N = tiled('BrickNeighbor', 'brick_wall_11', 2.2)
STUCCO = tiled('Stucco', 'painted_plaster_wall', 2.5, '#F2DEBC')
STUCCO2 = tiled('StuccoSage', 'painted_plaster_wall', 2.5, '#BFD1B0')
STUCCO3 = tiled('StuccoPeach', 'painted_plaster_wall', 2.5, '#F0BE96')
TRIM = mat('TrimCream', '#EDE4D3', .5)
GREEN = mat('FrameGreen', '#1F7A4A', .4)
GREEN_D = mat('GreenDark', '#155C37', .45)
SUBWAY = tiled('SubwayTile', 'long_white_tiles', 1.2)
FLOOR_T = tiled('FloorTile', 'floor_tiles_06', 2.4, '#F2F6F0')
PAINT = grime('WallPaint', '#F1E7D6', '#E9DCC6', .85, 2.5)
CEIL = mat('Ceiling', '#F7F3EC', .9)
STEEL = grime('Steel', '#C4C9CC', '#AEB4B8', .28, 25., .85 if MODE == 'render' else 0.)
STEEL_D = mat('SteelDark', '#8A9196', .35, .85 if MODE == 'render' else 0.)
WOOD = tiled('Butcherblock', 'kitchen_wood', 1.2)
WOOD_D = tiled('WoodDark', 'fine_grained_wood', 1.2)
PAVER = tiled('Pavers', 'concrete_pavement', 3.)
CONCRETE = tiled('Concrete', 'concrete_floor_02', 3.)
ASPHALT = tiled('Asphalt', 'asphalt_02', 4.)
LINE = mat('RoadLine', '#F2EEDF', .7)
CURB = tiled('Curb', 'concrete_floor_02', 2., '#E6E1D7')
AWNING = tiled('Awning', stripe_tex('awning_green', '#1F7A4A', '#F4EEE0'), 1.4, rough=.85)
KRAFT = grime('Kraft', '#C9A36F', '#B48C58', .8, 12.)
BAG = mat('DeliveryBag', '#1F7A4A', .7)
TOMATO = mat('Tomato', '#D1392B', .35)
LETTUCE = grime('Lettuce', '#7BB84A', '#5E9A36', .7, 15.)
CARROT = mat('Carrot', '#EE7F2D', .5)
BREAD = grime('Bread', '#D9A15E', '#B97E40', .7, 10.)
RICE = mat('Rice', '#F5F1E6', .8)
BLACK = mat('Black', '#26282A', .6)
LEAF = grime('Leaves', '#5E9E4A', '#3F7F35', .8, 3.)
LEAF2 = grime('LeavesWarm', '#86B04A', '#5E8E38', .8, 3.)
BARK = grime('Bark', '#5E4636', '#4A372A', .9, 12.)
SOIL = mat('Soil', '#4E3A2C', .95)
FLOWER_R = mat('FlowerRed', '#E0484F', .6)
FLOWER_Y = mat('FlowerYellow', '#F4C542', .6)
FLOWER_P = mat('FlowerPink', '#EF8FB0', .6)
CHALK = grime('Chalkboard', '#2F3A35', '#26302B', .9, 6.)
CORK = grime('Cork', '#C48A55', '#AD7443', .9, 20.)
CLOTH = mat('Tablecloth', '#EDE6D8', .9)
BULB = mat('Bulb', '#FFF4DA', .3, emit='#FFD58A', strength=8)
SHADE = mat('LampShade', '#1F5C3B', .5)
SHOP_GLOW = mat('ShopGlow', '#B89A74', .8, emit='#FFD79A', strength=.45)
CURTAIN = grime('Curtain', '#E8D9BC', '#D7C4A2', .9, 8.)
GLASS = mat('Glass', '#A9C7D2', .05)
CAN_FRONT = mat('Fridge', '#DADDDF', .35)

def glassify(m):
    nt = m.node_tree; n = nt.nodes; L = nt.links
    t = n.new('ShaderNodeBsdfTransparent'); mix = n.new('ShaderNodeMixShader'); mix.inputs[0].default_value = .06
    L.new(t.outputs[0], mix.inputs[1]); L.new(principled(m).outputs[0], mix.inputs[2])
    L.new(mix.outputs[0], n['Material Output'].inputs['Surface'])
glassify(GLASS)

# ---------- geometry helpers (three.js coordinates)
def link(o):
    scene.collection.objects.link(o) if o.name not in scene.collection.objects else None
    GROUPS.setdefault(GROUP[0], []).append(o); return o

def finish(o, m, bevel=0., seg=2):
    if bevel:
        b = o.modifiers.new('bev', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.harden_normals = False
    if m: o.data.materials.append(m)
    GROUPS.setdefault(GROUP[0], []).append(o)
    return o

def box(name, x0, x1, y0, y1, z0, z1, m, bevel=.008, seg=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.name = name; o.scale = (abs(x1 - x0), abs(z1 - z0), abs(y1 - y0))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(o, m, bevel, seg)

def cyl(name, x, y0, y1, z, r, m, verts=24, bevel=0., r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=y1 - y0, location=T(x, (y0 + y1) / 2, z))
    o = bpy.context.object; o.name = name
    for p in o.data.polygons: p.use_smooth = len(p.vertices) == 4
    return finish(o, m, bevel)

def ball(name, x, y, z, r, m, sub=2, squash=1.):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=T(x, y, z))
    o = bpy.context.object; o.name = name; o.scale.z = squash
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for p in o.data.polygons: p.use_smooth = True
    return finish(o, m)

def cut(target, *cutters):
    for c in cutters:
        md = target.modifiers.new('cut', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = c; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    for md in list(target.modifiers):
        if md.type == 'BOOLEAN': bpy.ops.object.modifier_apply(modifier=md.name)
    for c in cutters:
        for g in GROUPS.values():
            if c in g: g.remove(c)
        bpy.data.objects.remove(c)

def cutter(x0, x1, y0, y1, z0, z1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=T((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.scale = (x1 - x0, z1 - z0, y1 - y0); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return o

def rotate_y(o, deg, pivot=None):
    # Spin around the vertical axis (three y = Blender z).
    o.rotation_euler.z += math.radians(deg)
    return o

FONT = None
for f in (r'C:\Windows\Fonts\georgiab.ttf', r'C:\Windows\Fonts\georgia.ttf', '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'):
    if os.path.exists(f): FONT = bpy.data.fonts.load(f); break

def text(body, size, x, y, z, m, extrude=.02, align='CENTER', ry=0.):
    bpy.ops.object.text_add(location=T(x, y, z))
    o = bpy.context.object; o.data.body = body; o.data.size = size; o.data.extrude = extrude
    o.data.align_x = align; o.data.align_y = 'CENTER'
    if FONT: o.data.font = FONT
    o.data.resolution_u = 3
    o.rotation_euler = (math.radians(90), 0, math.radians(ry))
    o.data.materials.append(m)
    bpy.ops.object.convert(target='MESH')
    GROUPS.setdefault(GROUP[0], []).append(o)
    return o

def empty(name, x, y, z):
    e = bpy.data.objects.new(name, None); e.location = T(x, y, z); scene.collection.objects.link(e); return e


# ---------- real props (Poly Haven CC0 models), recentred to stand on their base, decimated for the web
LIB = {}
def lib(asset):
    if asset not in LIB:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(PH, 'mod', asset, asset + '.gltf'))
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type == 'MESH': mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        for o in [o for o in new if o.type != 'MESH']: bpy.data.objects.remove(o)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            for c in list(o.users_collection): c.objects.unlink(o)
        LIB[asset] = new
    return LIB[asset]

def prop(asset, x, y, z, ry=0., parts=None, height=None, width=None, s=1., maxtris=3000):
    src = [o for o in lib(asset) if parts is None or any(o.name.split('.')[0].endswith(p) for p in parts)]
    objs = []
    for o in src:
        c = o.copy(); c.data = o.data.copy(); scene.collection.objects.link(c); objs.append(c)
    bpy.ops.object.select_all(action='DESELECT')
    for c in objs: c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.select_set(False)
    vs = o.data.vertices; xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
    off = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
    o.data.transform(__import__('mathutils').Matrix.Translation(-off))
    h = max(zs) - min(zs); w = max(max(xs) - min(xs), max(ys) - min(ys))
    k = s * (height / h if height else width / w if width else 1.)
    o.scale = (k, k, k); o.location = T(x, y, z); o.rotation_euler.z = math.radians(ry)
    tris = sum(len(f.vertices) - 2 for f in o.data.polygons)
    if tris > maxtris:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = max(.02, maxtris / tris)
    o.name = asset
    GROUPS.setdefault(GROUP[0], []).append(o)
    return o

# =====================================================================
# Building: two storeys, brick ground floor with big shop windows, cream stucco above.
BX0, BX1, BD, H1, H2 = -7., 7., -9., 4.3, 8.0
group('shell')
front = box('Facade', BX0, BX1, 0, H1, -.32, 0, BRICK, 0)
WINS = [(-6.4, -3.9), (-3.3, -.8), (2.6, 6.4)]
DOOR = (.2, 2.0)
cut(front, *[cutter(a, b, .55, 3.45, -1, 1) for a, b in WINS], cutter(*DOOR, -.1, 3.2, -1, 1))
upper = box('FacadeUpper', BX0, BX1, H1, H2, -.32, 0, STUCCO, 0)
UPW = [(-6.0, -4.2), (-3.4, -1.6), (-.8, 1.0), (1.8, 3.6), (4.4, 6.2)]
cut(upper, *[cutter(a, b, H1 + 1.0, H1 + 2.9, -1, 1) for a, b in UPW])
box('Cornice', BX0 - .25, BX1 + .25, H2, H2 + .28, -.55, .25, TRIM, .02)
box('CorniceBand', BX0 - .12, BX1 + .12, H1 - .1, H1 + .12, -.4, .14, TRIM, .02)
box('Plinth', BX0 - .05, BX1 + .05, 0, .35, -.36, .06, CONCRETE, .01)
box('SideL', BX0 - .32, BX0, 0, H2, BD, 0, BRICK_N, 0)
box('SideR', BX1, BX1 + .32, 0, H2, BD, 0, BRICK_N, 0)
box('Back', BX0, BX1, 0, H2, BD - .3, BD, BRICK_N, 0)
box('Roof', BX0 - .3, BX1 + .3, H2, H2 + .1, BD - .3, -.3, CONCRETE, 0)

# Window and door frames in deep green, mullions, sills, glass.
for a, b in WINS:
    for x in (a, b - .08): box('WinJamb', x, x + .08, .55, 3.45, -.24, -.12, GREEN, .01)
    box('WinHead', a, b, 3.37, 3.45, -.24, -.12, GREEN, .01)
    box('WinSill', a - .08, b + .08, .47, .57, -.3, .1, TRIM, .01)
    box('WinTransom', a, b, 2.72, 2.78, -.24, -.12, GREEN, .01)
    mid = (a + b) / 2; box('WinMullion', mid - .03, mid + .03, .57, 2.72, -.24, -.12, GREEN, .01)
for a, b in UPW:
    box('UpSill', a - .1, b + .1, H1 + .92, H1 + 1.02, -.34, .06, TRIM, .01)
    box('UpHead', a - .1, b + .1, H1 + 2.9, H1 + 3.05, -.34, .04, TRIM, .01)
    for x in (a, b - .06): box('UpJamb', x, x + .06, H1 + 1.0, H1 + 2.9, -.22, -.14, TRIM)
    box('UpRail', a, b, H1 + 1.9, H1 + 1.95, -.22, -.14, TRIM)
for x in (DOOR[0], DOOR[1] - .1): box('DoorJamb', x, x + .1, 0, 3.2, -.28, -.08, GREEN, .01)
box('DoorHead', *DOOR, 3.1, 3.2, -.28, -.08, GREEN, .01)

group('glass')
for a, b in WINS: box('Glass', a, b, .55, 3.45, -.19, -.17, GLASS, 0)
for a, b in UPW:
    box('Glass', a, b, H1 + 1.0, H1 + 2.9, -.2, -.18, GLASS, 0)
# The door is propped open: one leaf swung out against the wall.
group('shell')
leaf = box('DoorLeaf', DOOR[0], DOOR[0] + .85, .02, 3.08, -.06, 0, GREEN, .01)
group('glass'); box('DoorGlass', DOOR[0] + .12, DOOR[0] + .73, .9, 2.9, -.04, -.02, GLASS, 0)
group('shell')

# Upper windows glow softly from rooms behind them.
group('shell')
for a, b in UPW:
    box('RoomBack', a, b, H1 + 1.0, H1 + 2.9, -.9, -.85, SHOP_GLOW, 0)
    for side in (0, 1):
        cx = a + .25 if side == 0 else b - .25
        for k in range(4): cyl('Curtain', cx + (k - 1.5) * .07, H1 + 1.05, H1 + 2.85, -.3 + (k % 2) * .03, .05, CURTAIN, 8)

# Sign band: the full name, lit, with the heart logo.
group('sign')
box('SignBoard', -6.6, 6.6, 3.62, 4.18, -.02, .1, GREEN_D, .02)
CREAM_L = mat('SignLetters', '#FFF6E2', .4, emit='#FFE9C2', strength=1.6)
text('Free Meals on Wheels', .44, .55, 3.9, .12, CREAM_L, .03)
if LOGO and os.path.exists(LOGO):
    img = bpy.data.images.load(LOGO)
    lm = bpy.data.materials.new('Logo'); lm.use_nodes = True; nt = lm.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
    b = principled(lm); nt.links.new(tex.outputs['Color'], b.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    nt.links.new(tex.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = .6
    lm.blend_method = 'HASHED' if hasattr(lm, 'blend_method') else None
    for x in (-5.75, 5.75):
        bpy.ops.mesh.primitive_plane_add(size=.5, location=T(x, 3.9, .125)); p = bpy.context.object; p.name = 'LogoPlate'
        p.rotation_euler.x = math.radians(90); p.data.materials.append(lm); GROUPS.setdefault('logo', []).append(p)
group('sign')
KITCHEN_INK = mat('KitchenInk', '#1E5A3A', .5)
text('Community kitchen  ·  San Jose', .3, 0, H1 + .6, .02, KITCHEN_INK, .02)

# Blade sign by the door.
group('sign')
box('BladeArm', 2.2, 2.25, 3.0, 3.06, 0, .9, BLACK, 0)
blade = box('Blade', 2.12, 2.2, 2.1, 2.95, .3, .9, GREEN_D, .015)
text('Meals', .16, 2.24, 2.62, .6, CREAM_L, .01, ry=90)
text('served here', .1, 2.24, 2.4, .6, CREAM_L, .008, ry=90)

# Awning over the door and right window, where meals are handed out.
group('props')
bpy.ops.mesh.primitive_plane_add(size=1); aw = bpy.context.object; aw.name = 'Awning'
me = aw.data; bm = bmesh.new()
x0, x1 = -.2, 6.8; y0, y1, z1 = 3.5, 2.75, 1.9
v = [bm.verts.new(T(x0, y0, 0)), bm.verts.new(T(x1, y0, 0)), bm.verts.new(T(x1, y1, z1)), bm.verts.new(T(x0, y1, z1))]
bm.faces.new(v); bm.to_mesh(me); bm.free(); bpy.data.objects.remove(aw)
aw = bpy.data.objects.new('Awning', me); scene.collection.objects.link(aw)
sol = aw.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = .03
finish(aw, AWNING)
# Scalloped valance along the front edge, alternating green and cream.
SCALLOP_CREAM = mat('ScallopCream', '#F4EEE0', .8)
for i in range(28):
    x = x0 + (i + .5) * (x1 - x0) / 28
    o = cyl('Scallop', x, y1 - .22, y1, z1 + .01, .125, GREEN if i % 2 else SCALLOP_CREAM, 12)
    o.rotation_euler.x = math.radians(90); o.scale = (1, 1, .12); o.location = T(x, y1 - .1, z1)
for x in (x0 + .1, x1 - .1): cyl('AwningPole', x, 0, y1, z1 - .05, .03, BLACK, 12)

# =====================================================================
# Inside: the kitchen. Floor, tiled walls, ceiling, lights.
group('shell')
box('Floor', BX0, BX1, -.02, 0, BD, -.32, FLOOR_T, 0)
box('Ceiling', BX0, BX1, H1 - .05, H1, BD, -.32, CEIL, 0)
for (a, b, c, d) in ((BX0, BX0 + .02, BD, -.32), (BX1 - .02, BX1, BD, -.32), (BX0, BX1, BD, BD + .02)):
    box('TileWall', a, b, 0, 1.8, c, d, SUBWAY, 0)
    box('PaintWall', a, b, 1.8, H1, c, d, PAINT, 0)
for (a, b, c, d) in ((BX0 + .02, BX0 + .05, BD + .02, -.32), (BX1 - .05, BX1 - .02, BD + .02, -.32), (BX0, BX1, BD + .02, BD + .05)):
    box('TileCap', a, b, 1.78, 1.84, c, d, GREEN, 0)

group('kitchen')
# Cook line along the back wall: ranges, big pots, a hood.
for i, x in enumerate((-6.4, -5.1, -3.8, -2.5)):
    box('Range', x, x + 1.25, 0, .88, BD + .05, BD + .95, STEEL, .015)
    box('RangeDoor', x + .1, x + 1.15, .12, .62, BD + .95, BD + .97, STEEL_D, .01)
    box('RangeTop', x, x + 1.25, .88, .92, BD + .05, BD + .95, BLACK, .01)
    for k, (dx, dz) in enumerate(((.33, .3), (.92, .3), (.33, .68), (.92, .68))):
        cyl('Grate', x + dx, .92, .95, BD + .05 + dz, .16, BLACK, 16)
    cyl('Knobs', x + .62, .74, .78, BD + .97, .02, BLACK, 8)
pots = [(-6.07, .5, .26, .4), (-5.48, .3, .2, .3), (-4.77, .45, .24, .36), (-3.88, .35, .22, .3), (-3.2, .55, .27, .45), (-2.17, .28, .18, .26)]
for x, h, r, dz in pots:
    cyl('Pot', x, .95, .95 + h, BD + .05 + dz + .1, r, STEEL, 28)
    cyl('PotRim', x, .95 + h - .02, .95 + h + .01, BD + .05 + dz + .1, r + .015, STEEL_D, 28)
bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=2.9, radius2=2.2, depth=.7, location=T(-4.3, 2.55, BD + .65))
hood = bpy.context.object; hood.name = 'Hood'; hood.rotation_euler.z = math.radians(45); hood.scale = (1.45, .5, 1)
bpy.ops.object.transform_apply(rotation=True, scale=True); finish(hood, STEEL, .01)
box('HoodDuct', -4.8, -3.8, 2.9, H1, BD + .05, BD + .7, STEEL, .01)
# Shelving with containers and stacked pans.
for y in (.35, 1.0, 1.65, 2.3):
    box('Shelf', -1.0, 1.6, y, y + .03, BD + .05, BD + .55, STEEL, .005)
for x in (-1.0, 1.57):
    for z in (BD + .07, BD + .52): box('ShelfPost', x, x + .03, 0, 2.35, z - .015, z + .015, STEEL_D, 0)
def pile(asset, cx, y, cz, n, rx, rz, height, maxtris=350, parts=None):
    for k in range(n):
        o = prop(asset, cx + random.uniform(-rx, rx), y + (k % 3) * height * .35, cz + random.uniform(-rz, rz), random.uniform(0, 360), parts=parts, height=height, maxtris=maxtris)
        o.rotation_euler.x = random.uniform(-.4, .4)
# Stock on the shelves: boxes of donated goods, cans, cartons, a tub of rice.
for y in (.38, 1.03, 1.68):
    x = -.75
    for k in range(4):
        kind = (k + int(y * 3)) % 4
        if kind == 0: prop('cardboard_box_01', x + .2, y, BD + .3, 90, height=.34, maxtris=600); x += .5
        elif kind == 1:
            for j in range(4): prop('long_life_food', x + .06 + j * .1, y, BD + .2 + (j % 2) * .12, 0, parts=['beans'], height=.13, maxtris=200)
            x += .45
        elif kind == 2: prop('plastic_container', x + .25, y, BD + .3, 0, width=.48, maxtris=500); x += .55
        else:
            for j in range(3): prop('long_life_food', x + .06 + j * .11, y, BD + .3, 0, parts=['milk'], height=.22, maxtris=100)
            x += .38
for k in range(5): cyl('PanStack', 1.25, 2.33 + k * .045, 2.37 + k * .045, BD + .3, .2, STEEL, 24)
# Walk-in cooler.
box('Cooler', 2.4, 6.9, 0, 3.1, BD + .05, BD + 1.6, CAN_FRONT, .02)
box('CoolerDoor', 3.6, 4.9, .05, 2.6, BD + 1.6, BD + 1.66, STEEL, .02)
box('CoolerHandle', 4.65, 4.72, 1.0, 1.6, BD + 1.66, BD + 1.74, STEEL_D, .01)
box('CoolerStrip', 2.4, 6.9, 2.85, 2.95, BD + 1.6, BD + 1.63, GREEN, 0)
# Sink station on the left wall.
box('Sink', BX0 + .05, BX0 + .8, 0, .9, -6.2, -3.8, STEEL, .015)
box('SinkBowl', BX0 + .15, BX0 + .7, .78, .91, -5.8, -4.2, STEEL_D, .01)
cyl('Faucet', BX0 + .2, .9, 1.25, -5.0, .02, STEEL, 10)
box('Rack', BX0 + .05, BX0 + .4, 1.3, 1.34, -6.2, -3.8, STEEL, 0)
for k in range(8): cyl('Plate', BX0 + .22, 1.34, 1.6, -6.0 + k * .28, .12, CLOTH, 20).rotation_euler.y = math.radians(90)

# Prep island in the middle: butcher block on steel, the day's vegetables and bowls.
box('IslandTop', -5.0, -.6, .88, .94, -5.7, -4.5, WOOD, .015)
box('IslandShelf', -4.9, -.7, .25, .28, -5.6, -4.6, STEEL, .005)
for x in (-4.95, -.7):
    for z in (-5.65, -4.6): box('IslandLeg', x, x + .05, 0, .88, z, z + .05, STEEL, 0)
for k in range(5): prop('plastic_crate_01', -4.5 + k * .82, .28, -5.1, 90, width=.42, maxtris=900)
for k, kind in enumerate(('yellow_onion', 'sweet_potato', 'food_apple_01', 'lemon', 'yellow_onion')):
    pile(kind, -4.5 + k * .82, .45, -5.1, 6, .12, .08, .085)
for i in range(4):
    x = -4.5 + i * 1.1
    prop('wooden_cutting_board', x - .05, .94, -5.15, 90 + random.uniform(-8, 8), width=.48, maxtris=500)
    cyl('Bowl', x + .38, .94, 1.06, -4.78, .13, STEEL, 20, r2=.16)
    pile(('yellow_onion', 'sweet_potato', 'lemon', 'food_apple_01')[i], x + .38, 1.0, -4.78, 4, .05, .05, .08)
    for j in range(3): ball('Tomato', x - .2 + j * .08, .99, -5.2 + random.uniform(-.05, .05), .035, TOMATO, 2)
prop('wicker_basket_01', -1.15, .94, -5.0, 20, width=.42, maxtris=1500)
prop('bananas', -1.15, 1.0, -5.0, 30, parts=['bunch'], width=.28, maxtris=1500)

# Packing line by the windows: trays of meals in kraft boxes, lids, insulated delivery bags by the door.
box('PackTop', 2.0, 6.4, .88, .94, -3.4, -2.4, STEEL, .015)
for x in (2.05, 6.3):
    for z in (-3.35, -2.5): box('PackLeg', x, x + .05, 0, .88, z, z + .05, STEEL, 0)
box('PackShelf', 2.1, 6.3, .25, .28, -3.3, -2.5, STEEL, .005)
CHICKEN = grime('Chicken', '#C98A4B', '#A86A32', .6, 20.)
BROC = grime('Broccoli', '#4E8A3A', '#3A6E2B', .8, 30.)
GRAIN = bpy.data.textures.new('grain', 'CLOUDS'); GRAIN.noise_scale = .012
def meal(x, y, z, lid=True):
    # An open kraft to-go box: tray walls, rice, chicken, greens, carrots, lid tipped back on its hinge.
    w, d, h, t = .34, .26, .065, .006
    box('MealTray', x - w / 2, x + w / 2, y, y + t, z - d / 2, z + d / 2, KRAFT, 0)
    box('MealWall', x - w / 2, x + w / 2, y, y + h, z - d / 2, z - d / 2 + t, KRAFT, 0)
    box('MealWall', x - w / 2, x + w / 2, y, y + h, z + d / 2 - t, z + d / 2, KRAFT, 0)
    box('MealWall', x - w / 2, x - w / 2 + t, y, y + h, z - d / 2, z + d / 2, KRAFT, 0)
    box('MealWall', x + w / 2 - t, x + w / 2, y, y + h, z - d / 2, z + d / 2, KRAFT, 0)
    box('MealDivider', x - .02, x - .014, y, y + h * .8, z - d / 2, z + d / 2, KRAFT, 0)
    r = ball('Rice', x - .085, y + .035, z, .1, RICE, 3, .32); r.scale.y = 1.2
    rd = r.modifiers.new('grain', 'DISPLACE'); rd.texture = GRAIN; rd.strength = .008
    for k in range(4): ball('Chicken', x + .05 + (k % 2) * .06, y + .045, z - .06 + (k // 2) * .07, .035, CHICKEN, 2, .7)
    for k in range(3): ball('Broccoli', x + .12 - k * .03, y + .05, z + .08 - (k % 2) * .03, .026, BROC, 2)
    for k in range(4): box('CarrotDice', x + .02 + k * .025, x + .038 + k * .025, y + .04, y + .058, z + .09, z + .108, CARROT, 0)
    if lid:
        lo = box('MealLid', x - w / 2, x + w / 2, y + h - .003, y + h + .003, z - d, z, KRAFT, 0)
        lo.location = T(x, y + h + d / 2 * .94, z - d / 2 - d / 2 * .34); lo.rotation_euler.x = math.radians(70)
for r in range(2):
    for c in range(7):
        meal(2.3 + c * .56, .94, -3.15 + r * .48, lid=(r + c) % 3 != 0)
for k in range(4): box('Lids', 6.0, 6.35, .94 + k * .03, .965 + k * .03, -3.3, -3.0, KRAFT, .005)
for k, x in enumerate((2.4, 3.1, 3.8)):
    for s in range(1 + k % 2): box('DeliveryBag', x, x + .55, s * .42, s * .42 + .4, -1.5, -.9, BAG, .04)

# Pendant lights.
for x in (-4.6, -2.4, 3.2, 5.2):
    for z in ((-5.1,) if x < 0 else (-2.9,)):
        cyl('Cord', x, 2.9, H1, z, .006, BLACK, 6)
        cyl('Shade', x, 2.55, 2.9, z, .28, SHADE, 24, r2=.06)
        ball('PendantBulb', x, 2.55, z, .08, BULB, 2)
        L = bpy.data.lights.new('pend', 'POINT'); L.energy = 160; L.color = srgb('#FFD9A0'); L.shadow_soft_size = .15
        lo = bpy.data.objects.new('pendL', L); lo.location = T(x, 2.45, z); scene.collection.objects.link(lo)
box('Strip', -6.5, 6.5, H1 - .08, H1 - .05, -7.4, -7.3, BULB, 0)
ar = bpy.data.lights.new('ceil', 'AREA'); ar.energy = 900; ar.size = 10; ar.size_y = 6; ar.shape = 'RECTANGLE'; ar.color = srgb('#FFF0DA')
ao = bpy.data.objects.new('ceilL', ar); ao.location = T(0, H1 - .15, -4.6); scene.collection.objects.link(ao)

# Story chalkboard and contact corkboard on the side wall inside the door? No: out front where the street sees them.
# =====================================================================
# Street front: sidewalk, curb, road, far curb. Plaza in front of the kitchen.
group('ground')
box('Sidewalk', -30, 30, -.06, 0, 0, 8.6, PAVER, 0)
box('Curb', -30, 30, -.16, .0, 8.6, 8.85, CURB, .02)
box('Road', -30, 30, -.2, -.15, 8.85, 16.5, ASPHALT, 0)
for k in range(-15, 16): box('Dash', k * 2 - .6, k * 2 + .6, -.15, -.148, 12.6, 12.75, LINE, 0)
box('FarCurb', -30, 30, -.16, 0, 16.5, 16.75, CURB, .02)
box('FarWalk', -30, 30, -.06, 0, 16.75, 22, CONCRETE, 0)
box('Crosswalk', -11.6, -9.0, -.15, -.147, 9.0, 16.4, LINE, 0)

# Hand-out table under the awning: cloth, stacked meal boxes, the donation jar spot.
group('props')
box('HandoutTop', 2.6, 6.0, .76, .8, 1.15, 1.95, CLOTH, .02)
box('HandoutSkirt', 2.62, 5.98, .25, .78, 1.93, 1.95, AWNING, 0)
for x in (2.7, 5.85):
    for z in (1.2, 1.85): box('HandoutLeg', x, x + .04, 0, .76, z, z + .04, BLACK, 0)
for c in range(4):
    for s in range(3 - c % 2): box('HandoutBox', 3.4 + c * .42, 3.74 + c * .42, .8 + s * .07, .866 + s * .07, 1.37, 1.63, KRAFT, .004)
meal(4.95, .8, 1.75); meal(4.45, .8, 1.78, False)
for k in range(2): prop('wooden_crate_01', 5.3, k * .33, 2.55, 0, parts=['01'], width=.8, maxtris=1200)
pile('food_apple_01', 5.3, .66, 2.55, 7, .25, .1, .09)
prop('wicker_basket_01', 2.95, .8, 1.75, -10, width=.4, maxtris=1500)
pile('food_apple_01', 2.95, .85, 1.75, 5, .1, .07, .085)
prop('bananas', 3.3, .8, 1.3, 70, parts=['bunch'], width=.26, maxtris=1500)
cyl('Water', 2.95, .8, 1.15, 1.45, .12, STEEL, 20)
empty('anchor_handout', 4.2, 1.5, 1.55)
empty('anchor_jar', 5.6, .8, 1.5)

# Story chalkboard on an easel by the door, and the community notice board at the plaza edge.
# Board faces match the page surfaces exactly (1.6:1 and 1.66:1) so zooming in never swaps boards.
group('props')
for x in (-1.92, -.08): box('EaselLeg', x - .04, x + .04, 0, 2.35, 1.3, 1.36, WOOD_D, .01)
box('StoryFrame', -1.98, -.02, .85, 2.15, 1.24, 1.3, WOOD_D, .015)
box('EaselTray', -1.9, -.1, .81, .85, 1.18, 1.34, WOOD_D, .005)
group('boards')
box('StoryBoardFace', -1.88, -.12, .95, 2.05, 1.3, 1.31, CHALK, 0)
group('props')
NX = -9.0; NZ = 1.7
for x in (NX - 1.25, NX + 1.25): cyl('NoticePost', x, 0, 2.6, NZ - .06, .05, WOOD_D, 10)
box('NoticeFrame', NX - 1.2, NX + 1.2, .85, 2.38, NZ - .04, NZ + .04, WOOD_D, .02)
box('NoticeRoof', NX - 1.45, NX + 1.45, 2.42, 2.52, NZ - .2, NZ + .35, GREEN_D, .02)
group('boards')
box('ContactBoardFace', NX - 1.1, NX + 1.1, .95, 2.275, NZ + .04, NZ + .05, CORK, 0)
group('props')
empty('anchor_story', -1.0, 1.5, 1.31)
empty('anchor_contact', NX, 1.6, NZ + .05)
e = empty('board_story', -1.0, 1.5, 1.312); e['w'] = 1.76; e['h'] = 1.1
e = empty('board_contact', NX, 1.6125, NZ + .052); e['w'] = 2.2; e['h'] = 1.325

# Get-a-meal tables on the plaza, with chairs, planters and trees.
def bistro(x, z, ry=0.):
    prop('outdoor_table_chair_set_01', x, 0, z, ry, height=.86, maxtris=4000)
for x, z, r in ((-5.4, 3.6, 10), (-2.6, 5.2, -15), (-5.8, 6.6, 25), (.4, 6.4, 0)): bistro(x, z, r)
# Dinner on the tables: the reserved one (your seat and a friend's) and one plate on each of the others.
meal(.32, .726, 6.62, False); meal(.30, .726, 6.26, False)
for x, z in ((-5.47, 3.62), (-2.68, 5.22), (-5.88, 6.62)): meal(x, .726, z + .12, False)
empty('anchor_meal', -2.6, .8, 5.2)

CLOUDS = bpy.data.textures.new('clouds', 'CLOUDS'); CLOUDS.noise_scale = .35
TREES = []
def tree(x, z, s=1.):
    box('Planter', x - .7, x + .7, 0, .5, z - .7, z + .7, CONCRETE, .03)
    box('PlanterSoil', x - .62, x + .62, .46, .5, z - .62, z + .62, SOIL, 0)
    if True:
        t_ = prop('jacaranda_tree', x, .45, z, random.uniform(0, 360), height=6.2 * s, maxtris=10 ** 7); t_['bakeonly'] = 1
        TREES.append((x, .45, z, 6.2 * s))
        for k in range(2): prop('shrub_sorrel_01', x - .3 + k * .6, .45, z + random.uniform(-.3, .3), random.uniform(0, 360), height=.35, maxtris=900)
        return
    cyl('Trunk', x, .5, 2.6 * s, z, .09 * s, BARK, 10, r2=.06 * s)
    for k in range(7):
        a = k * 2.4; r = .55 * s if k else 0
        c = ball('Canopy', x + math.cos(a) * r, (2.9 + (k % 3) * .35) * s, z + math.sin(a) * r, random.uniform(.6, .85) * s, LEAF if k % 2 else LEAF2, 3)
        d = c.modifiers.new('lumps', 'DISPLACE'); d.texture = CLOUDS; d.strength = .35 * s; d.texture_coords = 'GLOBAL'
    for k in range(10):
        a = k * .63; ball('Flower', x + math.cos(a) * .5, .55, z + math.sin(a) * .5, .07, (FLOWER_R, FLOWER_Y, FLOWER_P)[k % 3], 1)
tree(-12.0, 5.4); tree(8.4, 4.8, 1.1); tree(-17.5, 5.2, .95); tree(13.8, 5.4)
# Benches facing the plaza.
def bench(x, z):
    # Park bench: oak slats on black cast frames, facing the street.
    for k in range(4): box('BenchSlat', x - .9, x + .9, .43, .46, z - .22 + k * .12, z - .13 + k * .12, WOOD, .008)
    for k in range(3): box('BenchBackSlat', x - .9, x + .9, .58 + k * .11, .66 + k * .11, z + .27, z + .3, WOOD, .008)
    for dx in (-.75, .75):
        box('BenchFrame', x + dx - .03, x + dx + .03, 0, .43, z - .22, z - .16, BLACK, .005)
        box('BenchFrame', x + dx - .03, x + dx + .03, 0, .92, z + .24, z + .3, BLACK, .005)
        box('BenchArm', x + dx - .03, x + dx + .03, .62, .66, z - .24, z + .3, BLACK, .005)
for x, z in ((7.6, 7.4), (-9.6, 7.4)): bench(x, z)
# String lights from the building out to poles at the curb.
for x in (-6.8, -.6, 6.8):
    cyl('LightPole', x, 0, 4.2, 8.2, .05, BLACK, 10)
def wire(pts):
    cu = bpy.data.curves.new('wire', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = .006; cu.bevel_resolution = 1
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p_, q in zip(sp.points, pts): p_.co = (*T(*q), 1)
    o = bpy.data.objects.new('Wire', cu); scene.collection.objects.link(o); o.data.materials.append(BLACK)
    bpy.context.view_layer.objects.active = o; o.select_set(True); bpy.ops.object.convert(target='MESH'); o.select_set(False)
    GROUPS.setdefault(GROUP[0], []).append(o)
def strand(p0, p1, sag, n):
    pts = []
    for k in range(n + 1):
        t = k / n; q = [p0[i] + (p1[i] - p0[i]) * t for i in range(3)]; q[1] -= math.sin(t * math.pi) * sag; pts.append(q)
    wire(pts)
    for q in pts[1:-1]: ball('StringBulb', q[0], q[1] - .05, q[2], .045, BULB, 1)
for x0_, x1_ in ((-6.8, -.6), (-.6, 6.8)): strand((x0_, 4.05, 8.2), (x1_, 4.05, 8.2), .55, 14)
for x in (-6.8, -.6, 6.8): strand((x, H1 + .1, .05), (x, 4.05, 8.2), .6, 10)

# Street furniture: lamps, hydrant, bins, planters by the windows, plants by the door, a sidewalk sign.
for x in (-14, 14): prop('street_lamp_01', x, 0, 8.25, 90, height=4.6, maxtris=3000)
prop('fire_hydrant', 9.8, 0, 8.1, 30, parts=['fire_hydrant'], height=.8, maxtris=2500)
for x in (-8.0, 11.2): prop('metal_trash_can', x, 0, 8.1, 0, parts=['metal_trash_can'], height=.95, maxtris=2000)
for a, b in WINS[:2]:
    for sx in (a + .65, b - .65):
        prop('planter_box_01', sx, 0, .32, 0, height=.5, maxtris=1500)
        for k in range(2): prop('shrub_03', sx - .25 + k * .5, .4, .32, random.uniform(0, 360), height=.5, maxtris=1100)
for x in (-.25, 2.45): prop('potted_plant_02', x, 0, .45, random.uniform(0, 360), parts=['pot', 'leaves'], height=1.0, maxtris=4500)
prop('standing_chalkboard_01', 1.1, 0, 3.4, 200, height=1.1, maxtris=1500)
prop('industrial_storage_cart', 5.2, 0, -1.3, 0, height=1.0, maxtris=3000)
for x in (-6, 8): prop('water_manhole_cover', x, -.149, 11, 0, width=.7, maxtris=800)

# =====================================================================
# Neighbours: a terrace of shops either side so the kitchen sits on a real street.
group('neigh')
def slope(name, x0, x1, y0, y1, z1, m):
    # A canvas awning: a slanted sheet from the wall (y0) out to z1 at height y1, with a valance.
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    v = [bm.verts.new(T(x0, y0, -.28)), bm.verts.new(T(x1, y0, -.28)), bm.verts.new(T(x1, y1, z1)), bm.verts.new(T(x0, y1, z1))]
    bm.faces.new(v); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); scene.collection.objects.link(o)
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = .025
    finish(o, m); box(name + 'Valance', x0, x1, y1 - .22, y1, z1 - .01, z1 + .01, m, 0)
def neighbour(x0, x1, h, wall, awn, name, frame=None):
    frame = frame or TRIM
    box('NWall', x0, x1, 0, h, BD + 1, -.3, wall, 0)
    box('NCornice', x0 - .12, x1 + .12, h, h + .3, -.6, .12, TRIM, .02)
    box('NCorniceSub', x0 - .05, x1 + .05, h - .25, h, -.45, -.02, TRIM, .01)
    box('NBand', x0, x1, 3.75, 4.0, -.42, .02, TRIM, .01)
    box('NPlinth', x0, x1, 0, .3, -.36, -.22, CONCRETE, .01)
    # Shopfront: dark frame, mullions, warm interior, door at one end.
    sx0, sx1 = x0 + .45, x1 - .45
    box('NShopBack', sx0, sx1, .45, 3.2, -.33, -.31, SHOP_GLOW, 0)
    box('NShopGlass', sx0, sx1, .45, 3.2, -.27, -.26, GLASS, 0)
    for xx in (sx0 - .08, sx1):
        box('NShopJamb', xx, xx + .08, .3, 3.3, -.3, -.18, frame, .01)
    box('NShopHead', sx0 - .08, sx1 + .08, 3.2, 3.32, -.3, -.18, frame, .01)
    box('NShopSill', sx0 - .08, sx1 + .08, .3, .45, -.32, -.14, frame, .01)
    k = max(1, int((sx1 - sx0) // 1.6))
    for i in range(1, k): xx = sx0 + i * (sx1 - sx0) / k; box('NMullion', xx - .03, xx + .03, .45, 3.2, -.28, -.2, frame, .005)
    box('NTransom', sx0, sx1, 2.55, 2.6, -.28, -.2, frame, .005)
    slope('NAwning', sx0 - .1, sx1 + .1, 3.55, 2.75, 1.25, awn)
    # Upper windows: frame, sill, lintel, glass with a lit room behind some of them.
    n = max(1, int((x1 - x0) // 2.3))
    for i in range(n):
        cx = x0 + (i + .5) * (x1 - x0) / n
        for fy in range(int((h - 4.3) // 3.1)):
            y = 4.6 + fy * 3.1
            box('NRoom', cx - .55, cx + .55, y, y + 1.8, -.33, -.31, SHOP_GLOW if random.random() < .3 else CURTAIN, 0)
            box('NWinGlass', cx - .55, cx + .55, y, y + 1.8, -.27, -.26, GLASS, 0)
            for xx in (cx - .62, cx + .55): box('NWinJamb', xx, xx + .07, y, y + 1.8, -.3, -.2, TRIM, .005)
            box('NWinRail', cx - .55, cx + .55, y + 1.1, y + 1.14, -.28, -.22, TRIM, 0)
            box('NSill', cx - .7, cx + .7, y - .12, y, -.42, -.16, TRIM, .01)
            box('NLintel', cx - .7, cx + .7, y + 1.8, y + 1.98, -.38, -.2, TRIM, .01)
    text(name, .3, (x0 + x1) / 2, 3.87, .03, GREEN_D if wall is not BRICK_N else TRIM, .015)
AWN_RED = tiled('AwningRed', stripe_tex('awning_red', '#B4443A', '#F3E8D6'), 1.2, rough=.85)
AWN_NAVY = mat('AwningNavy', '#2D4A6B', .85)
AWN_MUSTARD = tiled('AwningMustard', stripe_tex('awning_mustard', '#D9A33A', '#F5ECD8'), 1.0, rough=.85)
AWN_TEAL = mat('AwningTeal', '#2F7D7A', .85)
AWN_BURG = mat('AwningBurgundy', '#7E2F3A', .85)
neighbour(-14.5, -7.35, 11.5, STUCCO2, AWN_NAVY, 'Corner Books')
neighbour(-22, -14.5, 8.3, BRICK_N, AWN_RED, 'Flower Market', GREEN_D)
neighbour(7.35, 15.5, 10.2, STUCCO3, AWN_MUSTARD, 'Bakery')
neighbour(15.5, 23, 13, BRICK_N, AWN_TEAL, 'Hardware', BLACK)
neighbour(-30, -22, 9.4, STUCCO, AWN_BURG, 'Cafe')
neighbour(23, 30, 8.6, STUCCO2, AWN_NAVY, 'Laundry')
# Far side of the street: low hedges and a park edge so the foreground isn't empty.
for x in range(-28, 30, 4):
    prop('shrub_02', x + random.uniform(-.6, .6), 0, 18.2, random.uniform(0, 360), parts=[random.choice('abcd')], height=1.1, maxtris=700)

# =====================================================================
# Sun, sky, render settings.
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 2.6; sun.angle = math.radians(3); sun.color = srgb('#FFD3A1')
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so)
so.rotation_euler = Vector((-.55, .8, -.36)).to_track_quat('-Z', 'Y').to_euler()
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']
try:
    sky = world.node_tree.nodes.new('ShaderNodeTexSky')
    for t in ('MULTIPLE_SCATTERING', 'NISHITA', 'HOSEK_WILKIE'):
        try: sky.sky_type = t; break
        except Exception: pass
    try: sky.sun_elevation = math.radians(20); sky.sun_rotation = math.radians(210)
    except Exception: pass
    world.node_tree.links.new(sky.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = .22
except Exception:
    bg.inputs['Color'].default_value = (*srgb('#BFD8EE'), 1); bg.inputs['Strength'].default_value = 1.

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
for d in prefs.devices: d.use = d.type == 'OPTIX'
scene.cycles.device = 'GPU'
try: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Punchy'
except Exception as e: print('view', e)
scene.view_settings.exposure = float(os.environ.get('EXPO', '-0.6'))

def look(cam, pos, target, fov=40):
    cam.location = T(*pos)
    cam.rotation_euler = (T(*target) - T(*pos)).to_track_quat('-Z', 'Y').to_euler()
    cam.data.angle = math.radians(fov)

# ---------- final pass: apply modifiers, world-scaled box UVs on photo-textured surfaces
def box_uv(o, tile):
    me = o.data; mw = o.matrix_world; nm = mw.to_3x3()
    while len(me.uv_layers) > 1: me.uv_layers.remove(me.uv_layers[-1])
    if not me.uv_layers: me.uv_layers.new(name='UVMap')
    me.uv_layers[0].name = 'UVMap'; uv = me.uv_layers[0].data
    for p_ in me.polygons:
        n = nm @ p_.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p_.loop_indices:
            v = mw @ me.vertices[me.loops[li].vertex_index].co
            u, w = ((v.y, v.z), (v.x, v.z), (v.x, v.y))[ax]
            uv[li].uv = (u / tile, w / tile)
def finalize():
    dg = bpy.context.evaluated_depsgraph_get()
    for o in list(scene.objects):
        if o.type != 'MESH': continue
        if o.modifiers:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); o.modifiers.clear(); o.data = me
        tiles = [TILE[m.name] for m in o.data.materials if m and m.name in TILE]
        if tiles: box_uv(o, tiles[0])
finalize()

if MODE == 'render':
    scene.cycles.samples = int(ARGS[3]) if len(ARGS) > 3 else 96
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); scene.collection.objects.link(cam); scene.camera = cam
    shots = {
        'overview': ((5, 7.5, 26), (0, 3, 0), 42),
        'kitchen': ((5.2, 1.9, -1.0), (-2.5, 1.1, -7.5), 62),
        'handout': ((1.2, 1.7, 5.4), (4.2, 1.0, 1.4), 50),
        'street': ((-9, 1.7, 11), (0, 2.5, 0), 55),
        'meals': ((4.0, 1.6, -1.6), (4.0, .9, -3.2), 50),
    }
    pick = ARGS[4].split(',') if len(ARGS) > 4 else list(shots)
    for name in pick:
        look(cam, *shots[name])
        scene.render.filepath = os.path.join(OUT, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'kitchen.blend'))

# =====================================================================
# Bake for the web. Photo-textured surfaces keep their tiling textures and get a lightmap (second UV);
# everything else is baked to colour atlases (albedo x light). The web then draws unlit, which is cheap.
if MODE == 'bake':
    import numpy as np
    scene.cycles.samples = int(os.environ.get('BAKE_SAMPLES', '384'))
    scene.render.bake.margin = 16
    WEB = os.path.join(OUT, 'web'); os.makedirs(WEB, exist_ok=True)
    LM_DENSITY = float(os.environ.get('LM_DENSITY', '22'))     # lightmap texels per metre
    COLOR_DENSITY = float(os.environ.get('COLOR_DENSITY', '90'))

    for m in bpy.data.materials:
        if m.use_nodes and 'Principled BSDF' in m.node_tree.nodes:
            b = m.node_tree.nodes['Principled BSDF']; inp = b.inputs['Metallic']
            for l in list(inp.links): m.node_tree.links.remove(l)
            inp.default_value = 0.

    def has_alpha(m):
        return m and m.use_nodes and any(n.type == 'BSDF_PRINCIPLED' and n.inputs['Alpha'].is_linked for n in m.node_tree.nodes)

    # Tree billboards: render each tree once against a transparent background, lit like the scene.
    def impostor(src, name):
        cam_d = bpy.data.cameras.new('imp'); cam_d.type = 'ORTHO'
        cam = bpy.data.objects.new('imp', cam_d); scene.collection.objects.link(cam)
        xs = [ (src.matrix_world @ Vector(v)) for v in src.bound_box ]
        lo = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs))); hi = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
        c = (lo + hi) / 2; w = max(hi.x - lo.x, hi.y - lo.y); h = hi.z - lo.z
        cam_d.ortho_scale = max(w, h); cam.location = (c.x, c.y - 30, c.z); cam.rotation_euler = (math.radians(90), 0, 0)
        hidden = [o for o in scene.objects if o.type == 'MESH' and o is not src and not o.hide_render]
        for o in hidden: o.hide_render = True
        old = (scene.camera, scene.render.film_transparent, scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples)
        scene.camera = cam; scene.render.film_transparent = True
        scene.render.resolution_x = scene.render.resolution_y = 1024; scene.cycles.samples = 64; scene.cycles.use_denoising = True
        scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'
        path = os.path.join(WEB, f'{name}.png'); scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        for o in hidden: o.hide_render = False
        scene.camera, scene.render.film_transparent, scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples = old
        bpy.data.objects.remove(cam)
        return path, max(w, h), (c.z - lo.z) / max(w, h)

    # Classify and join into buckets.
    def area(o):
        return sum(p_.area for p_ in o.data.polygons) * (o.scale.x * o.scale.y)
    EMISSIVE = {'Bulb', 'SignLetters', 'ShopGlow'}
    buckets = {}
    for gname, objs in GROUPS.items():
        for o in objs:
            if o.name not in scene.objects or o.type != 'MESH': continue
            mats = [m for m in o.data.materials if m]
            if o.get('bakeonly'): continue
            if any(m.name == 'Glass' for m in mats): kind = 'glass'
            elif all(m.name in EMISSIVE for m in mats): kind = 'emit'
            elif any(m.name in TILE for m in mats): kind = 'tile'
            elif any(has_alpha(m) for m in mats): kind = 'leaf'
            elif any(m.name in ('Steel', 'SteelDark') for m in mats): kind = 'steel'
            elif gname == 'logo': kind = 'logo'
            elif max(o.dimensions) < .36 and gname in ('kitchen', 'props'): kind = 'vcol'
            else: kind = 'color'
            buckets.setdefault((gname, kind), []).append(o)

    def join(objs, name):
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1: bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active; o.name = name
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for i, m in enumerate(o.data.materials):
            if m is None: o.data.materials[i] = next(x for x in o.data.materials if x)
        return o

    def lm_uv(o, density):
        me = o.data
        if 'LM' not in me.uv_layers: me.uv_layers.new(name='LM')
        me.uv_layers.active = me.uv_layers['LM']
        names = [l.name for l in me.uv_layers if l.name != 'LM']
        render = 'UVMap' if 'UVMap' in names else (names[0] if names else 'LM')
        for l in me.uv_layers: l.active_render = l.name == render
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        scene.tool_settings.use_uv_select_sync = True  # so packing sees every island, not just UV-selected ones
        bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=.004, area_weight=0., scale_to_bounds=False)
        bpy.ops.uv.pack_islands(margin=.006, rotate=True)
        bpy.ops.object.mode_set(mode='OBJECT')
        a = sum(p_.area for p_ in me.polygons)
        uvd = me.uv_layers['LM'].data; us = [d.uv.x for d in uvd]; vs = [d.uv.y for d in uvd]
        # If packing left most of the square empty (long thin pieces), stretch the layout to fill it.
        su, sv = 1 / max(1e-4, max(us)), 1 / max(1e-4, max(vs))
        if su > 1.3 or sv > 1.3:
            for d in uvd: d.uv = (d.uv.x * min(su, 1 / .999), d.uv.y * min(sv, 1 / .999)) if False else (d.uv.x * su * .999, d.uv.y * sv * .999)
            us = [d.uv.x for d in uvd]; vs = [d.uv.y for d in uvd]
        print('UVDBG', o.name, len(me.polygons), round(min(us), 3), round(max(us), 3), round(min(vs), 3), round(max(vs), 3), 'area', round(a, 1), 'dims', [round(x, 1) for x in o.dimensions])
        size = 2 ** max(8, min(12, round(math.log2(max(1, math.sqrt(a) * density)))))
        return size

    def bake_into(o, size, kind):
        img = bpy.data.images.new(o.name, size, size, float_buffer=True)
        nodes = []
        for m in o.data.materials:
            if not m or not m.use_nodes: continue
            n = m.node_tree.nodes.new('ShaderNodeTexImage'); n.image = img
            for x in m.node_tree.nodes: x.select = False
            n.select = True; m.node_tree.nodes.active = n; nodes.append((m, n))
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        rb = scene.render.bake
        if kind in ('tile', 'leaf'):
            rb.use_pass_direct = rb.use_pass_indirect = True; rb.use_pass_color = False
            bpy.ops.object.bake(type='DIFFUSE', margin=16, use_clear=True)
        else:
            rb.use_pass_direct = rb.use_pass_indirect = True; rb.use_pass_diffuse = True
            rb.use_pass_glossy = False; rb.use_pass_transmission = False; rb.use_pass_emit = True
            bpy.ops.object.bake(type='COMBINED', margin=16, use_clear=True)
        for m, n in nodes: m.node_tree.nodes.remove(n)
        return img

    def save(img, name, scale_pct=99.2):
        px = np.empty(len(img.pixels), np.float32); img.pixels.foreach_get(px)
        px = px.reshape(-1, 4); rgb = px[:, :3]
        lit = rgb[px[:, 3] > 0]
        top = float(np.percentile(lit.max(axis=1), scale_pct)) if len(lit) else 1.
        k = .92 / max(top, 1e-4)
        v = np.clip(rgb * k, 0, 1)
        v = np.where(v <= .0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - .055)
        out = bpy.data.images.new(name + '_8', img.size[0], img.size[1], alpha=False)
        px[:, :3] = v; px[:, 3] = 1; out.pixels.foreach_set(px.ravel())
        out.filepath_raw = os.path.join(WEB, name + '.png'); out.file_format = 'PNG'; out.save()
        return out, 1 / k

    exported = []
    report = []
    for (gname, kind), objs in buckets.items():
        name = f'{gname}_{kind}'
        o = join(objs, name)
        if kind == 'glass':
            exported.append(o); continue
        if kind == 'emit':
            for m in o.data.materials: m['emit'] = 1
            o['bake'] = 'emit'; exported.append(o); continue
        if kind == 'vcol':
            me = o.data
            for a_ in list(me.color_attributes): me.color_attributes.remove(a_)
            ca = me.color_attributes.new('BakeCol', 'FLOAT_COLOR', 'CORNER'); me.color_attributes.active_color = ca
            rb = scene.render.bake; rb.target = 'VERTEX_COLORS'
            rb.use_pass_direct = rb.use_pass_indirect = rb.use_pass_diffuse = rb.use_pass_emit = True; rb.use_pass_glossy = rb.use_pass_transmission = False
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
            bpy.ops.object.bake(type='COMBINED', use_clear=True)
            rb.target = 'IMAGE_TEXTURES'
            col = np.empty(len(ca.data) * 4, np.float32); ca.data.foreach_get('color', col); col = col.reshape(-1, 4)
            top = float(np.percentile(col[:, :3].max(axis=1), 99.2)); k = .92 / max(top, 1e-4)
            col[:, :3] = np.clip(col[:, :3] * k, 0, 1); col[:, 3] = 1; ca.data.foreach_set('color', col.ravel())
            m = bpy.data.materials.new('Baked_' + name); m.use_nodes = True; nt = m.node_tree
            an = nt.nodes.new('ShaderNodeVertexColor'); an.layer_name = 'BakeCol'
            nt.links.new(an.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
            o.data.materials.clear(); o.data.materials.append(m)
            for l in list(o.data.uv_layers): o.data.uv_layers.remove(l)
            o['bake'] = 'vcol'; o['scale'] = 1 / k
            report.append((name, kind, 0, len(o.data.polygons), round(1 / k, 3)))
            exported.append(o); continue
        dens = (LM_DENSITY if kind in ('tile', 'leaf') else COLOR_DENSITY) * {'ground': 1.8, 'props': 1.7, 'kitchen': 1.4, 'shell': 1.2}.get(gname, 1.)
        size = lm_uv(o, dens)
        img = bake_into(o, size, kind)
        out, scale = save(img, name)
        o['bake'] = kind; o['scale'] = scale; o['image'] = name + '.png'
        report.append((name, kind, size, len(o.data.polygons), round(scale, 3)))
        if kind in ('color', 'steel', 'logo'):
            # Replace every material with one unlit-ready material reading the atlas on LM.
            m = bpy.data.materials.new('Baked_' + name); m.use_nodes = True; nt = m.node_tree
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = out
            uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'LM'; nt.links.new(uvn.outputs[0], t.inputs[0])
            nt.links.new(t.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
            if kind == 'logo':
                # Keep the logo's alpha from the source material.
                pass
            o.data.materials.clear(); o.data.materials.append(m)
            for l in list(o.data.uv_layers):
                if l.name != 'LM': o.data.uv_layers.remove(l)
        else:
            # Tiled/leaf: keep their own textures (first UV) and ship the lightmap as a separate file (second UV).
            for m in o.data.materials:
                if m and m.name in TILE: m['tile'] = 1
            uvs = o.data.uv_layers
            first = 'UVMap' if 'UVMap' in uvs else [l.name for l in uvs if l.name != 'LM'][0]
            for l in list(uvs):
                if l.name not in (first, 'LM'): uvs.remove(l)
        exported.append(o)

    # Billboards for the trees, rendered with their real leaves; the real trees stay only for baked shadows.
    imp_cache = {}
    for i, (x, y, z, h) in enumerate(TREES):
        src = next(o for o in scene.objects if o.get('bakeonly') and abs(o.location.x - x) < .01)
        if 'tree' not in imp_cache: imp_cache['tree'] = impostor(src, 'tree_billboard')
        path, size_, base = imp_cache['tree']
        k = h / size_ if size_ else 1
        img = bpy.data.images.load(path, check_existing=True)
        m = bpy.data.materials.get('Leaf_tree') or bpy.data.materials.new('Leaf_tree')
        if not m.get('built'):
            m['built'] = 1; m.use_nodes = True; nt = m.node_tree; t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
            b = nt.nodes['Principled BSDF']; nt.links.new(t.outputs['Color'], b.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        for r in (0, 90):
            bpy.ops.mesh.primitive_plane_add(size=1); pl = bpy.context.object; pl.name = f'Tree{i}_{r}'
            pl.scale = (size_ * k, size_ * k, 1); pl.rotation_euler = (math.radians(90), 0, math.radians(r))
            pl.location = T(x, y + size_ * k / 2 - .1, z); pl.data.materials.append(m); pl['billboard'] = 1
            exported.append(pl)

    for o in list(scene.objects):
        if o.get('bakeonly') or (o.type == 'MESH' and o not in exported) or o.type in ('LIGHT', 'CAMERA'):
            bpy.data.objects.remove(o)
    print('BAKE_REPORT', report)
    bpy.ops.export_scene.gltf(filepath=os.path.join(WEB, 'kitchen.glb'), export_format='GLB', export_yup=True,
                              export_extras=True, export_apply=True, export_texcoords=True, export_normals=True,
                              export_image_format='AUTO', export_vertex_color='ACTIVE')
    print('EXPORTED', os.path.join(WEB, 'kitchen.glb'))
