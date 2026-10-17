# Free Meals on Wheels food truck, built headless in Blender and exported as GLB.
# Coordinates match the web scene (three.js): X along the truck, three Y = Blender Z, three Z = -Blender Y.
# Front (customer side) of the truck is three +Z, which is Blender -Y.
import bpy, bmesh, math, sys
from mathutils import Vector

OUT = sys.argv[sys.argv.index('--') + 1]
LOGO = sys.argv[sys.argv.index('--') + 2]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def mat(name, color, rough=.5, metal=0., emit=None, strength=1.):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = strength
    return m

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

GREEN = mat('Paint_Green', srgb('#178A4C'), .28, .15)
GREEN_D = mat('Paint_GreenDark', srgb('#0F5A33'), .35, .15)
CREAM = mat('Paint_Cream', srgb('#FFF6E6'), .4)
ORANGE = mat('Paint_Orange', srgb('#F2782E'), .35)
CHROME = mat('Chrome', srgb('#E9E9E6'), .12, 1.)
TIRE = mat('Tire', srgb('#1E1E1E'), .85)
RIM = mat('Rim', srgb('#F4F1EA'), .3, .2)
GLASS = mat('Glass', srgb('#9EC6D6'), .05, .3)
DARK = mat('Chassis', srgb('#26292A'), .8)
LAMP = mat('Lamp', srgb('#FFF4D6'), .2, emit=srgb('#FFE9B0'), strength=3)
TAIL = mat('Taillight', srgb('#C2262A'), .3, emit=srgb('#FF3030'), strength=1.5)
BULB = mat('Bulb', srgb('#FFF6DA'), .2, emit=srgb('#FFD27A'), strength=6)
WOOD = mat('Wood', srgb('#B57A4A'), .6)
GOLD = mat('Gold', srgb('#FFD9A8'), .4)

def obj_from(mesh, name, material):
    o = bpy.data.objects.new(name, mesh); scene.collection.objects.link(o)
    if material: o.data.materials.append(material)
    return o

def box(name, x0, x1, y0, y1, z0, z1, material, bevel=0., seg=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    o = bpy.context.object; o.name = name; o.scale = (x1 - x0, y1 - y0, z1 - z0)
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new('bev', 'BEVEL'); m.width = bevel; m.segments = seg; m.limit_method = 'ANGLE'
    o.data.materials.append(material)
    return o

def cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = cutter; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    for mod in list(target.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter)

def apply_all(o):
    bpy.context.view_layer.objects.active = o
    for mod in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=mod.name)

def smooth(o, angle=40):
    o.data.shade_smooth_by_angle(angle=math.radians(angle)) if hasattr(o.data, 'shade_smooth_by_angle') else None
    for p in o.data.polygons: p.use_smooth = True

# Web scene constants
X0, X1, Z, FLOOR, TOP = -3.6, 2.6, 1.15, .78, 3.25
W0, W1, WB, WT = -2.4, 1.0, 1.65, 2.75
CX0, CX1 = X1, X1 + 1.6

# ---- Body shell: rounded box, hollowed, with the serving window cut in the front (Blender -Y side).
body = box('Body', X0, X1, -Z, Z, .5, TOP, GREEN, bevel=.1, seg=4); apply_all(body)
inner = box('in', X0 + .08, X1 - .08, -Z + .08, Z - .08, FLOOR - .02, TOP - .08, GREEN); cut(body, inner)
win = box('win', W0, W1, -Z - .3, -Z + .3, WB, WT, GREEN); cut(body, win)
smooth(body)
# Cream upper band and roof cap, orange pinstripe, dark lower rocker.
cap = box('RoofCap', X0 - .04, X1 + .04, -Z - .04, Z + .04, TOP - .02, TOP + .16, CREAM, bevel=.08, seg=4); apply_all(cap); smooth(cap)
for sy in (-1, 1):
    band = box('Band', X0 + .05, X1 - .05, sy * (Z + .001) - .006, sy * (Z + .001) + .006, TOP - .52, TOP - .02, CREAM)
    if sy < 0:
        wcut = box('w2', W0 - .05, W1 + .05, -Z - .3, -Z + .3, WB - .02, WT + .02, CREAM); cut(band, wcut)
    stripe = box('Pin', X0 + .05, X1 - .05, sy * (Z + .012) - .006, sy * (Z + .012) + .006, TOP - .58, TOP - .53, ORANGE)
    if sy < 0:
        wc2 = box('w3', W0 - .05, W1 + .05, -Z - .3, -Z + .3, WB - .02, WT + .02, ORANGE); cut(stripe, wc2)
    box('Rocker', X0 + .1, X1 - .1, sy * (Z + .012) - .01, sy * (Z + .012) + .01, .5, .72, GREEN_D)
# Window frame (chrome) and a wooden serving ledge are separate meshes.
for (x0, x1, z0, z1) in ((W0 - .06, W1 + .06, WT, WT + .06), (W0 - .06, W1 + .06, WB - .06, WB), (W0 - .06, W0, WB, WT), (W1, W1 + .06, WB, WT)):
    box('Frame', x0, x1, -Z - .05, -Z + .02, z0, z1, CHROME, bevel=.015)

# ---- Cab: side profile with a raked windshield, extruded across the width, generously rounded.
prof = [(CX0, .5), (CX1, .5), (CX1, 1.35), (CX1 - .2, 1.55), (CX1 - .55, 2.35), (CX0, 2.4)]
bm = bmesh.new()
vs = [bm.verts.new((x, -Z + .02, z)) for x, z in prof]
f = bm.faces.new(vs)
ext = bmesh.ops.extrude_face_region(bm, geom=[f])
for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]: v.co.y = Z - .02
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new('Cab'); bm.to_mesh(me); bm.free()
cab = obj_from(me, 'Cab', GREEN)
m = cab.modifiers.new('bev', 'BEVEL'); m.width = .14; m.segments = 6; m.limit_method = 'ANGLE'; apply_all(cab); smooth(cab, 50)
# Windshield and side windows (inset glass panels).
ws = box('Windshield', 0, .04, -Z + .2, Z - .2, 0, .78, GLASS)
ws.location = (CX1 - .38, 0, 1.95); ws.rotation_euler = (0, math.atan2(.35, .8) * -1 + 0, 0)
ws.rotation_euler = (0, -math.atan2(.35, .8), 0); ws.location = (CX1 - .4 + .02, 0, 1.56)
for sy in (-1, 1):
    box('SideWindow', CX0 + .15, CX1 - .7, sy * Z - .012, sy * Z + .012, 1.6, 2.2, GLASS, bevel=.03)
    box('Mirror', CX1 - .55, CX1 - .45, sy * (Z + .18) - .06, sy * (Z + .18) + .06, 1.75, 2.05, DARK, bevel=.02)
box('Grille', CX1 - .01, CX1 + .03, -.6, .6, .75, 1.25, CHROME, bevel=.02)
for i in range(5): box('GrilleBar', CX1 + .025, CX1 + .045, -.55, .55, .8 + i * .1, .83 + i * .1, DARK)
for sy in (-1, 1):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.13, location=(CX1 + .01, sy * .82, 1.05), segments=24, ring_count=12)
    o = bpy.context.object; o.scale.x = .5; o.data.materials.append(LAMP); smooth(o)
    box('Tail', X0 - .03, X0 + .01, sy * .9 - .1, sy * .9 + .1, .95, 1.25, TAIL, bevel=.02)
box('BumperF', CX1, CX1 + .16, -Z - .08, Z + .08, .5, .66, CHROME, bevel=.05)
box('BumperR', X0 - .16, X0, -Z - .02, Z + .02, .5, .66, CHROME, bevel=.05)
box('Chassis', X0 + .3, CX1 - .3, -Z + .25, Z - .25, .3, .52, DARK)
box('RearDoor', X0 - .02, X0 + .01, -.45, .45, FLOOR + .1, FLOOR + 2.0, GREEN_D, bevel=.02)

# ---- Wheels: one tire torus-like cylinder with bevel, a cream rim with spokes, chrome cap. No overlapping faces.
def wheel(x, sy):
    y = sy * (Z - .14)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.47, depth=.3, location=(x, y, .47), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object; t.name = 'Tire'; t.data.materials.append(TIRE)
    m = t.modifiers.new('bev', 'BEVEL'); m.width = .09; m.segments = 5; apply_all(t); smooth(t)
    face = sy * (Z - .14 + .152)
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=.3, depth=.02, location=(x, face, .47), rotation=(math.pi / 2, 0, 0))
    r = bpy.context.object; r.data.materials.append(RIM); smooth(r)
    for k in range(6):
        a = k * math.pi / 3
        s = box('Spoke', -.02, .02, -.006, .006, 0, .24, CHROME); s.location = (x, face + sy * .012, .47); s.rotation_euler = (0, a, 0)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=.08, location=(x, face + sy * .02, .47), segments=20, ring_count=10)
    c = bpy.context.object; c.scale.y = .45; c.data.materials.append(CHROME); smooth(c)
    # Fender arch, sitting just proud of the body side.
    bpy.ops.mesh.primitive_torus_add(major_radius=.6, minor_radius=.07, major_segments=40, minor_segments=10, location=(x, sy * (Z + .03), .47), rotation=(math.pi / 2, 0, 0))
    a = bpy.context.object; a.data.materials.append(GREEN_D)
    bm2 = bmesh.new(); bm2.from_mesh(a.data)
    bmesh.ops.delete(bm2, geom=[v for v in bm2.verts if v.co.y < -.02 * 0 and (a.matrix_world @ v.co).z < .5], context='VERTS')
    bm2.to_mesh(a.data); bm2.free(); smooth(a)
for x in (-2.3, CX0 + .8):
    for sy in (-1, 1): wheel(x, sy)

# ---- Awning: alternating orange/cream slats with a scalloped valance, angled out over the window.
aw = bpy.data.objects.new('AwningRig', None); scene.collection.objects.link(aw)
aw.location = (0, -Z - .02, WT + .12); aw.rotation_euler = (math.radians(18), 0, 0)
N, AW0, AW1, depth = 12, W0 - .25, W1 + .25, 1.05
for i in range(N):
    x0 = AW0 + (AW1 - AW0) * i / N; x1 = AW0 + (AW1 - AW0) * (i + 1) / N
    s = box('Slat', x0, x1, -depth, 0, -.015, .015, ORANGE if i % 2 == 0 else CREAM); s.parent = aw
    r, cxs = (x1 - x0) / 2, (x0 + x1) / 2
    bm3 = bmesh.new(); ctr = bm3.verts.new((cxs, -depth - .016, -.015))
    arc = [bm3.verts.new((cxs - r * math.cos(k * math.pi / 12), -depth - .016, -.015 - r * math.sin(k * math.pi / 12))) for k in range(13)]
    for k in range(12): bm3.faces.new((ctr, arc[k + 1], arc[k]))
    me3 = bpy.data.meshes.new('Scallop'); bm3.to_mesh(me3); bm3.free()
    sc = obj_from(me3, 'Scallop', ORANGE if i % 2 == 0 else CREAM); sc.parent = aw
for sx in (AW0, AW1):
    rod = box('AwningRod', -.012, .012, -.012, .012, 0, 1.08, CHROME); rod.location = (sx, -Z - .02, WT - .62); rod.rotation_euler = (math.radians(68.6), 0, 0)

# ---- Roof marquee: framed sign on posts, cream face, 3D lettering, logo, and a row of bulbs.
SX0, SX1, SZ0, SZ1 = -2.85, 1.85, TOP + .55, TOP + 1.55
box('SignFrame', SX0, SX1, -.12, .12, SZ0, SZ1, GREEN_D, bevel=.06, seg=4)
box('SignFace', SX0 + .1, SX1 - .1, -.13, .13, SZ0 + .1, SZ1 - .1, CREAM)
box('SignTrim', SX0 + .14, SX1 - .14, -.135, .135, SZ0 + .14, SZ1 - .14, ORANGE)
box('SignFace2', SX0 + .17, SX1 - .17, -.14, .14, SZ0 + .17, SZ1 - .17, CREAM)
for x in (SX0 + .4, (SX0 + SX1) / 2, SX1 - .4): box('Post', x - .035, x + .035, -.035, .035, TOP + .1, SZ0, DARK, bevel=.01)
for sy in (-1, 1):
    n = 22
    for i in range(n):
        x = SX0 + .1 + (SX1 - SX0 - .2) * i / (n - 1)
        for z in (SZ0 + .05, SZ1 - .05):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=.028, location=(x, sy * .125, z), segments=10, ring_count=6)
            bpy.context.object.data.materials.append(BULB)

def text(body, font, size, x, z, y, material, extrude=.018, align='LEFT', rot_z=0):
    cu = bpy.data.curves.new('T', 'FONT'); cu.body = body; cu.font = bpy.data.fonts.load(font) if isinstance(font, str) else font
    cu.size = size; cu.extrude = extrude; cu.align_x = align; cu.resolution_u = 3
    o = bpy.data.objects.new('Text', cu); scene.collection.objects.link(o)
    o.location = (x, y, z); o.rotation_euler = (math.pi / 2, 0, rot_z); o.data.materials.append(material)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.convert(target='MESH'); o.select_set(False)
    return o

F_BOLD = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
F_ITAL = '/System/Library/Fonts/Supplemental/Georgia Bold Italic.ttf'
F_REG = '/System/Library/Fonts/Supplemental/Georgia Italic.ttf'
fb, fi, fr = bpy.data.fonts.load(F_BOLD), bpy.data.fonts.load(F_ITAL), bpy.data.fonts.load(F_REG)

# Front of sign (faces -Y), back is the mirror (rotated 180 about Z).
def sign_side(sy):
    rz = 0 if sy < 0 else math.pi
    y = sy * .14 + sy * .001
    def X(x): return x if sy < 0 else (SX0 + SX1) - x
    a = text('Free Meals', fb, .42, 0, SZ0 + .5, y, GREEN_D, rot_z=rz, extrude=.012)
    b = text('on Wheels', fi, .42, 0, SZ0 + .5, y, ORANGE, rot_z=rz, extrude=.012)
    wa, wb, gap = a.dimensions.x, b.dimensions.x, .12
    start = SX0 + 1.15
    a.location.x = X(start)
    b.location.x = X(start + wa + gap)
    t = text('Bringing smiles, one meal at a time', fr, .15, 0, SZ0 + .26, y, GREEN, rot_z=rz, extrude=.006)
    t.location.x = X(start + .02)
for sy in (-1, 1): sign_side(sy)

# Side livery: logo disc + big lettering on both body sides, below the window.
for sy in (-1, 1):
    rz = 0 if sy < 0 else math.pi
    y = sy * (Z + .014)
    def X(x): return x if sy < 0 else (X0 + X1) - x
    a = text('Free Meals on Wheels', fb, .25, 0, 1.12, y, CREAM, rot_z=rz, extrude=.01)
    a.location.x = X(-.72)
    t = text('Bringing smiles, one meal at a time', fr, .12, 0, .94, y, GOLD, rot_z=rz, extrude=.004)
    t.location.x = X(-.7)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.34, depth=.02, location=(X(-1.2), y, 1.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(CREAM)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.31, depth=.024, location=(X(-1.2), y, 1.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(ORANGE)
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=.29, depth=.028, location=(X(-1.2), y, 1.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(CREAM)

# Logo image planes (front of sign, back of sign, both side discs, cab doors).
img = bpy.data.images.load(LOGO)
lm = bpy.data.materials.new('Logo'); lm.use_nodes = True; nt = lm.node_tree
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img
bsdf = nt.nodes['Principled BSDF']; nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
bsdf.inputs['Roughness'].default_value = .5
lm.blend_method = 'BLEND' if hasattr(lm, 'blend_method') else None
def logo(x, y, z, w, h, rz):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, z), rotation=(math.pi / 2, 0, rz))
    o = bpy.context.object; o.scale = (w, h, 1); bpy.ops.object.transform_apply(scale=True); o.data.materials.append(lm)
logo(SX0 + .6, -.146, (SZ0 + SZ1) / 2, .72, .64, 0)
logo(SX1 - .6, .146, (SZ0 + SZ1) / 2, .72, .64, math.pi)
logo(-1.2, -Z - .03, 1.1, .46, .41, 0)
logo((X0 + X1) + 1.2, Z + .03, 1.1, .46, .41, math.pi)
for sy in (-1, 1): logo(CX0 + .6, sy * (Z + .005), 1.15, .5, .45, 0 if sy < 0 else math.pi)

# Roof details: vent and AC unit.
box('AC', 1.4, 2.2, -.5, .3, TOP + .16, TOP + .48, CHROME, bevel=.06)
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=.1, depth=.4, location=(-3.2, .4, TOP + .36)); bpy.context.object.data.materials.append(CHROME)

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True)
print('EXPORTED', OUT)
