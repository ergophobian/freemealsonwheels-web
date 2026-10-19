# MetaHuman cast for the web: merge the face, clothes and hair cards onto the body skeleton, retarget the
# Universal Animation Library clips (plus the kitchen work clips) and export one GLB per person.
#   blender -b -P mh_anim.py -- <fixed.glb> <UAL1_Standard.glb> <out.glb> [render_dir]
# The animation helpers are shared with people.py (read from its source so there's one copy).
import bpy, sys, os, math, ast
from mathutils import Vector, Matrix, Quaternion
ARGS = sys.argv[sys.argv.index('--') + 1:]
SRC, UAL, OUT = ARGS[0], ARGS[1], ARGS[2]
RENDER = ARGS[3] if len(ARGS) > 3 and ARGS[3] != '-' else None
FBX = ARGS[4] if len(ARGS) > 4 else None  # folder of the same meshes exported from UE as FBX (correct skin weights)
CURL = float(os.environ.get('CURL', '1')); RTF = False; REF = {}
CLIPS = (['A_TPose'] if os.environ.get('TP') else []) + ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Interact', 'PickUp_Table']
EXPORT_CLIPS = CLIPS + ['Chop', 'Stir', 'Pack']

here = os.path.dirname(os.path.abspath(__file__))
tree = ast.parse(open(os.path.join(here, 'people.py'), encoding='utf-8').read())
SHARED = {'use_action', 'frame', '_aim', 'references', 'retarget', 'ik_pose', 'palm', 'lean', 'work_clip', 'add_work'}
exec(compile(ast.Module([n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in SHARED], []), 'people_shared', 'exec'))
AIM = _aim(None)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=SRC)
arms = [o for o in sc.objects if o.type == 'ARMATURE']
body = max(arms, key=lambda a: ('thigh_l' in a.data.bones) * 1000 + len(a.data.bones))
print('ARMATURES', [(a.name, len(a.data.bones)) for a in arms], 'body', body.name)

def ancestor_in_body(arm, name):
    b = arm.data.bones.get(name)
    while b is not None and b.name not in body.data.bones: b = b.parent
    return b.name if b else 'head'

for o in [o for o in sc.objects if o.type == 'MESH']:
    mod = next((m for m in o.modifiers if m.type == 'ARMATURE'), None)
    if mod is None or mod.object is None:
        # Hair and brow cards: static meshes, ride on the head bone.
        mw = o.matrix_world.copy(); o.parent = body; o.parent_type = 'BONE'; o.parent_bone = 'head'
        bpy.context.view_layer.update(); o.matrix_world = mw
        continue
    if mod.object is body: continue
    own = mod.object
    # Fold weights from bones the body doesn't have (face rig, cloth helpers) into their nearest body ancestor.
    remap = {g.name: (g.name if g.name in body.data.bones else ancestor_in_body(own, g.name)) for g in o.vertex_groups}
    idx = {g.index: g.name for g in o.vertex_groups}
    acc = {}
    for v in o.data.vertices:
        w = {}
        for ge in v.groups:
            t = remap[idx[ge.group]]; w[t] = w.get(t, 0.) + ge.weight
        acc[v.index] = w
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {}
    for vi, w in acc.items():
        for t, x in w.items():
            if t not in groups: groups[t] = o.vertex_groups.new(name=t)
            groups[t].add([vi], x, 'REPLACE')
    mw = o.matrix_world.copy(); mod.object = body; o.parent = body; bpy.context.view_layer.update(); o.matrix_world = mw
    print('MERGED', o.name, 'from', own.name, 'groups', len(groups))
# UE's glTF export leaves some vertices with no bone weights; they'd stay frozen while the body moves.
# Give each one the weights of its nearest weighted neighbour.
from mathutils import kdtree
for o in [o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]:
    vs = o.data.vertices; good = [v.index for v in vs if sum(g.weight for g in v.groups) > 1e-3]
    bad = [v.index for v in vs if sum(g.weight for g in v.groups) <= 1e-3]
    if not bad or not good: print('WEIGHTS ok', o.name); continue
    kd = kdtree.KDTree(len(good))
    for i in good: kd.insert(vs[i].co, i)
    kd.balance()
    names = {g.index: g for g in o.vertex_groups}
    for i in bad:
        _, j, _ = kd.find(vs[i].co)
        for ge in vs[j].groups: names[ge.group].add([i], ge.weight, 'REPLACE')
    print('WEIGHTS filled', o.name, len(bad), 'of', len(vs))
for a in arms:
    if a is not body: bpy.data.objects.remove(a)
for o in [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]: bpy.data.objects.remove(o)

# UE's glTF exporter scrambles the LOD bone indices; its FBX export doesn't. Copy every skinned mesh's weights
# from its FBX twin, vertex to vertex (the two line up exactly).
if FBX and os.path.isdir(FBX):
    for o in [o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]:  # facial-rig bones fold onto the head below
        f = next((x for x in os.listdir(FBX) if x[:-4] in o.name or o.name in x), None)
        if not f: print('NO FBX for', o.name); continue
        before = set(sc.objects); bpy.ops.import_scene.fbx(filepath=os.path.join(FBX, f))
        new = [x for x in sc.objects if x not in before]; twin = next(x for x in new if x.type == 'MESH')
        for g in list(o.vertex_groups): o.vertex_groups.remove(g)
        dt = o.modifiers.new('wt', 'DATA_TRANSFER'); dt.object = twin; dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'NEAREST'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.datalayout_transfer(modifier='wt')
        bpy.ops.object.modifier_move_to_index(modifier='wt', index=0); bpy.ops.object.modifier_apply(modifier='wt')
        for x in new: bpy.data.objects.remove(x)
        print('FBXWEIGHTS', o.name, 'from', f, len(o.vertex_groups))

# MetaHuman corrective/twist helpers are driven by RigLogic inside Unreal; here they'd sit still and stretch the skin.
# Move their weights onto the main limb bone they belong to (same part name and side), else the nearest driven ancestor.
UALNAMES = {'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'head', 'thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'}
for sd in 'lr':
    UALNAMES |= {f'{b}_{sd}' for b in ('clavicle', 'upperarm', 'lowerarm', 'hand')}
    UALNAMES |= {f'{f}_0{i}_{sd}' for f in ('index', 'middle', 'ring', 'pinky', 'thumb') for i in (1, 2, 3)}
def driven(name):
    if name in UALNAMES: return name
    parts = name.split('_'); sd = parts[-1] if parts[-1] in ('l', 'r') else None
    if sd and f'{parts[0]}_{sd}' in UALNAMES: return f'{parts[0]}_{sd}'
    b = body.data.bones.get(name)
    while b is not None and b.name not in UALNAMES: b = b.parent
    return b.name if b else ('head' if name.upper().startswith('FACIAL') else 'pelvis')
for o in [o for o in sc.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]:
    remap = {g.name: driven(g.name) for g in o.vertex_groups}
    moved = sorted({k for k, v in remap.items() if k != v})
    idx = {g.index: g.name for g in o.vertex_groups}
    acc = {}
    for v in o.data.vertices:
        w = {}
        for ge in v.groups: t = remap[idx[ge.group]]; w[t] = w.get(t, 0.) + ge.weight
        acc[v.index] = w
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {}
    for vi, w in acc.items():
        for t, x in w.items():
            if t not in groups: groups[t] = o.vertex_groups.new(name=t)
            groups[t].add([vi], x, 'REPLACE')
    print('HELPERS', o.name, len(moved), moved[:12])

# UE's glTF exporter scrambles the body LOD's bone indices, so re-skin the body from scratch on the main bones
# (bone heat). The clothes and face keep their own weights, which come through intact.
for o in [o for o in sc.objects if o.type == 'MESH' and o.name.startswith('Icosphere')]: bpy.data.objects.remove(o)
bodymesh = next(o for o in sc.objects if o.type == 'MESH' and 'BodyMesh' in o.name)
if not FBX:
    for b in body.data.bones: b.use_deform = b.name in UALNAMES and b.name != 'root'
    for g in list(bodymesh.vertex_groups): bodymesh.vertex_groups.remove(g)
    for m in [m for m in bodymesh.modifiers if m.type == 'ARMATURE']: bodymesh.modifiers.remove(m)
    bpy.ops.object.select_all(action='DESELECT'); bodymesh.select_set(True); body.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    print('REWEIGHT body groups', len(bodymesh.vertex_groups))
    # The clothes' exported weights are scrambled the same way; project the body's clean weights onto them along
    # the cloth normals (so the shirt's sides take the torso, not the nearby arms).
    for o in [o for o in sc.objects if o.type == 'MESH' and 'Outfit' in o.name]:
        for g in list(o.vertex_groups): o.vertex_groups.remove(g)
        dt = o.modifiers.new('wt', 'DATA_TRANSFER'); dt.object = bodymesh; dt.use_vert_data = True
        dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_VNORPROJ'; dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.datalayout_transfer(modifier='wt')
        bpy.ops.object.modifier_move_to_index(modifier='wt', index=0); bpy.ops.object.modifier_apply(modifier='wt')
        print('REWEIGHT outfit', o.name, len(o.vertex_groups))
for b in body.data.bones: b.use_deform = True

# Remove the body skin hidden under the clothes, so it can't poke through when limbs bend (and saves triangles).
import bmesh
from mathutils.bvhtree import BVHTree
outfits = [o for o in sc.objects if o.type == 'MESH' and 'Outfit' in o.name]
if outfits:
    dg = bpy.context.evaluated_depsgraph_get()
    trees = [BVHTree.FromObject(o, dg) for o in outfits]
    for skin in [bodymesh] + [o for o in sc.objects if o.type == 'MESH' and 'FaceMesh' in o.name]:
        bm = bmesh.new(); bm.from_mesh(skin.data); bm.verts.ensure_lookup_table()
        mw = skin.matrix_world; nm = mw.to_3x3()
        covered = set()
        for v in bm.verts:
            p_, n_ = mw @ v.co, (nm @ v.normal).normalized()
            for t in trees:
                hit = t.ray_cast(p_ - n_ * .002, n_, .08)
                if hit[0] is not None: covered.add(v.index); break
        dead = [f for f in bm.faces if all(v.index in covered for v in f.verts)]
        bmesh.ops.delete(bm, geom=dead, context='FACES'); bm.to_mesh(skin.data); bm.free()
        print('HIDDEN', skin.name, 'faces under clothes', len(dead))

# Animation library.
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=UAL)
new = [o for o in bpy.data.objects if o not in before]
src = next(o for o in new if o.type == 'ARMATURE')
for o in new:
    if o is not src and o.type == 'MESH' and not os.environ.get('TP'): bpy.data.objects.remove(o)
for c in CLIPS: print('CLIP', c, bool(retarget(src, body, c)))
for c in CLIPS:
    a = bpy.data.actions.get(c + '__rt')
    if a: bpy.data.actions[c].name = c + '_ual'; a.name = c
add_work(body)
if os.environ.get('TP'): src.location.x = 1.0
else: bpy.data.objects.remove(src)

if RENDER:
    os.makedirs(RENDER, exist_ok=True)
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.6, .65, .7, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (1.6, -3.4, 1.1); cam.rotation_euler = (Vector((0, 0, .9)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 40
    sc.render.engine = 'BLENDER_EEVEE' if 'BLENDER_EEVEE' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'CYCLES'
    sc.render.resolution_x, sc.render.resolution_y = 600, 800
    shots = (('Sitting_Idle_Loop', 5), ('Idle_Loop', 20), ('Walk_Loop', 6)) if os.environ.get('TP') else (('Walk_Loop', 6), ('Chop', 10), ('Sitting_Idle_Loop', 5), ('Idle_Loop', 20))
    for side in ((1.6, -3.4), (3.6, 0.)) if os.environ.get('TP') else ((1.6, -3.4),):
        cam.location = (side[0] + .5, side[1] - 1.5, 1.1); cam.rotation_euler = (Vector((.5, 0, .9)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
        for c, f in shots:
            use_action(body, bpy.data.actions[c])
            if os.environ.get('TP'): use_action(src, bpy.data.actions[c + '_ual'])
            sc.frame_set(f)
            sc.render.filepath = os.path.join(RENDER, f'{os.path.basename(OUT)[:-4]}_{c}_{int(side[0])}.png'); bpy.ops.render.render(write_still=True)
    use_action(body, None)

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
for o in body.children: o.select_set(True)
body.animation_data_create(); body.animation_data.action = None
for a in bpy.data.actions:
    if a.name in EXPORT_CLIPS:
        tr = body.animation_data.nla_tracks.new(); tr.name = a.name; st = tr.strips.new(a.name, 0, a)
        if hasattr(st, 'action_slot') and len(a.slots): st.action_slot = a.slots[0]
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_apply=False, export_yup=True, export_image_format='AUTO', export_force_sampling=True)
print('EXPORTED', OUT)
