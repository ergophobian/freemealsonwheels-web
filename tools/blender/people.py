# Realistic townspeople and volunteers for the kitchen street, built headless with MakeHuman (MPFB, CC0 assets).
# Each person gets a body, real skin texture, eyes, brows, hair and clothes, a game-engine rig, and the
# Universal Animation Library clips (CC0, Quaternius) retargeted onto that rig. One GLB per person.
#   blender -b -P people.py -- <out_dir> <UAL1_Standard.glb> [only_id] [render]
import bpy, addon_utils, importlib, os, sys, math
from mathutils import Matrix, Vector, Quaternion

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT, UAL = ARGS[0], ARGS[1]
ONLY = ARGS[2] if len(ARGS) > 2 and ARGS[2] != '-' else None
RENDER = len(ARGS) > 3 and ARGS[3] == 'render'
os.makedirs(OUT, exist_ok=True)

addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
svc = importlib.import_module('bl_ext.user_default.mpfb.services')
HS, TS = svc.HumanService, svc.TargetService
UD = os.path.join(os.environ['APPDATA'], 'Blender Foundation', 'Blender', '5.1', 'extensions', '.user', 'user_default', 'mpfb', 'data')
CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Sitting_Idle_Loop', 'Sitting_Talking_Loop', 'Interact', 'PickUp_Table']
GREEN = '#2E8B57'  # volunteer t-shirts

# id, gender (0 woman, 1 man), age (0.5 = 25, 0.75 = ~50, 0.9 = ~70), weight, height, race, skin, hair, clothes [(name, tint)], role
PEOPLE = [
    ('v-maya',   0, .5,  .45, .45, 'asian',     'young_asian_female',          'ponytail01', [('joepal_crude_t-shirt_female', GREEN), ('punkduck_female_tight_jeans', None), ('toigo_flats', None)], 'volunteer'),
    ('v-james',  1, .7,  .6,  .6,  'african',   'middleage_african_male',      'short02',    [('namuhekam_male_polo_shirt', GREEN), ('punkduck_male_classic_jeans', None), ('shoes01', None)], 'volunteer'),
    ('v-linda',  0, .72, .6,  .45, 'caucasian', 'middleage_caucasian_female',  'bob02',      [('joepal_crude_t-shirt_female', GREEN), ('toigo_wool_pants', None), ('toigo_flats', None)], 'volunteer'),
    ('v-ravi',   1, .52, .5,  .55, 'asian',     'young_asian_male',            'short04',    [('elvs_crude_t-shirt_male', GREEN), ('cortu_cargo_pants', None), ('shoes02', None)], 'volunteer'),
    ('v-priya',  0, .55, .5,  .4,  'asian',     'cutoff3d_indian_female_skin', 'braid01',    [('toigo_basic_tucked_t-shirt', GREEN), ('mindfront_female_trousers_1', None), ('toigo_ballet_flats', None)], 'volunteer'),
    ('n-chen',   1, .9,  .45, .4,  'asian',     'old_asian_male',              'short01',    [('mindfront_knitted_sweater_01', None), ('mindfront_male_trousers_1', None), ('shoes03', None)], 'neighbour'),
    ('n-grace',  0, .9,  .65, .35, 'african',   'old_african_female',          'rehmanpolanski_hair_bun_brown',      [('janexx_old_female_sweater', None), ('toigo_wool_pants', None), ('toigo_ballet_flats', None)], 'neighbour'),
    ('n-amara',  0, .45, .45, .5,  'african',   'young_african_female',        'afro01',     [('toigo_dress_with_tiered_skirt', '#E9B44C'), ('toigo_flats', None)], 'neighbour'),
    ('n-mei',    0, .7,  .5,  .4,  'asian',     'middleage_asian_female',      'long01',     [('toigo_camisole_top', None), ('mindfront_cardigan_long_open_front', None), ('mindfront_female_trousers_1', None), ('toigo_flats', None)], 'neighbour'),
    ('n-marcus', 1, .48, .55, .6,  'african',   'young_african_male',          'short03',    [('elvs_crude_t-shirt_male', '#3B5B8C'), ('elvs_jeans_straight_leg', None), ('shoes04', None)], 'neighbour'),
    ('n-tom',    1, .75, .65, .55, 'caucasian', 'middleage_caucasian_male',    'short02',    [('namuhekam_male_polo_shirt', '#9DB9D6'), ('mindfront_male_trousers_2', None), ('shoes05', None)], 'neighbour'),
    ('n-ruth',   0, .88, .55, .35, 'caucasian', 'old_caucasian_female',        'toigo_inverted_bob',      [('toigo_fisherman_sweater', None), ('toigo_wool_pants', None), ('toigo_flats', None)], 'neighbour'),
]

def use_action(obj, act):
    # Blender 5 actions hold slots; an action only drives an object once a slot is assigned.
    obj.animation_data_create(); obj.animation_data.action = act
    if act is not None and hasattr(obj.animation_data, 'action_slot') and len(act.slots):
        obj.animation_data.action_slot = act.slots[0]

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

def asset(kind, name, ext='mhclo'):
    p = os.path.join(UD, kind, name, f'{name}.{ext}')
    if not os.path.exists(p): raise FileNotFoundError(p)
    return p

def tint(obj, hexcol):
    # Multiply every image in the garment's materials by a colour (volunteers wear the green tee).
    for m in obj.data.materials:
        if not m or not m.node_tree: continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        inp = bsdf.inputs['Base Color']
        if inp.is_linked:
            src = inp.links[0].from_socket
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
            nt.links.new(src, mix.inputs['A']); mix.inputs['B'].default_value = (*srgb(hexcol), 1)
            nt.links.new(mix.outputs['Result'], inp)
        else:
            inp.default_value = (*srgb(hexcol), 1)

def build(spec):
    pid, gender, age, weight, height, race, skin, hair, clothes, role = spec
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TS.get_default_macro_info_dict()
    macro.update(gender=float(gender), age=age, weight=weight, height=height, muscle=.5, proportions=.5)
    macro['race'] = {'asian': 0., 'caucasian': 0., 'african': 0.}; macro['race'][race] = 1.
    base = HS.create_human(macro_detail_dict=macro, scale=0.1, mask_helpers=True, detailed_helpers=False, extra_vertex_groups=True, feet_on_ground=False)
    HS.add_builtin_rig(base, 'game_engine')
    rig = base.parent
    proxy = None  # the full body mesh keeps a far better face than the low-poly proxies; it is decimated evenly later
    HS.set_character_skin(asset('skins', skin, 'mhmat'), base, skin_type='MAKESKIN')
    HS.add_mhclo_asset(asset('eyes', 'high-poly'), base, asset_type='Eyes', subdiv_levels=0)
    HS.add_mhclo_asset(asset('eyebrows', 'eyebrow00%d' % (1 + hash(pid) % 9)), base, asset_type='Eyebrows', subdiv_levels=0)
    HS.add_mhclo_asset(asset('eyelashes', 'eyelashes01'), base, asset_type='Eyelashes', subdiv_levels=0)
    HS.add_mhclo_asset(asset('hair', hair), base, asset_type='Hair', subdiv_levels=0)
    for name, col in clothes:
        o = HS.add_mhclo_asset(asset('clothes', name), base, asset_type='Clothes', subdiv_levels=0)
        if col and o: tint(o, col)
    return base, rig, proxy

# ---------- retargeting UAL clips (UE-mannequin naming) onto the MPFB game-engine rig
def load_ual():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=UAL)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for o in new:
        if o is not arm and o.type == 'MESH': bpy.data.objects.remove(o)
    return arm

def retarget(src, dst, clip):
    act = bpy.data.actions.get(clip)
    if not act: return None
    names = {b.name.lower(): b.name for b in src.data.bones}
    FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')
    pairs = [(b.name, names[b.name.lower()]) for b in dst.data.bones if b.name.lower() in names and b.name.lower() != 'root' and not b.name.startswith(FINGERS)]
    order = [b.name for b in dst.data.bones]  # parents come before children
    pairs.sort(key=lambda p: order.index(p[0]))
    # Rest poses as posed matrices (MakeHuman lifts the skeleton onto the ground through its root bone's pose).
    use_action(src, None); use_action(dst, None)
    for pb in dst.pose.bones:
        if pb.name != 'Root': pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    srest = {s: src.pose.bones[s].matrix.copy() for _, s in pairs}
    trest = {d: dst.pose.bones[d].matrix.copy() for d, _ in pairs}
    fixed = {b.name: dst.pose.bones[b.name].matrix.copy() for b in dst.data.bones}
    # The library rests in a T-pose and MakeHuman in an A-pose: line each source rest bone up with the target's
    # rest direction first, so a pose means the same limb direction on both skeletons.
    def ydir(m): return (m.to_3x3() @ Vector((0, 1, 0))).normalized()
    align = {d: ydir(srest[s]).rotation_difference(ydir(trest[d])).inverted() for d, s in pairs}
    sp = names['pelvis']
    sfoot = min(src.pose.bones[names['foot_l']].head.z, src.pose.bones[names['foot_r']].head.z)
    tfoot = min(dst.pose.bones['foot_l'].head.z, dst.pose.bones['foot_r'].head.z)
    k = (trest['pelvis'].translation.z - tfoot) / max(1e-4, srest[sp].translation.z - sfoot)
    use_action(src, act)
    out = bpy.data.actions.new(clip + '__rt'); out.use_fake_user = True
    use_action(dst, out)
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for pb in dst.pose.bones: pb.rotation_mode = 'QUATERNION'
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        world = {}
        for d, s in pairs:
            spb = src.pose.bones[s]
            rot = spb.matrix.to_quaternion() @ srest[s].to_quaternion().inverted() @ align[d] @ trest[d].to_quaternion()
            bone = dst.data.bones[d]; par = bone.parent
            rest_rel = par.matrix_local.inverted() @ bone.matrix_local if par else bone.matrix_local
            pw = world.get(par.name) if par else None
            if pw is None: pw = fixed[par.name] if par else Matrix()
            if d == 'pelvis':
                head = trest[d].translation + (spb.matrix.translation - srest[s].translation) * k
            else:
                head = (pw @ rest_rel).translation
            m = Matrix.Translation(head) @ rot.to_matrix().to_4x4()
            world[d] = m
            basis = (pw @ rest_rel).inverted() @ m
            pb = dst.pose.bones[d]
            pb.rotation_quaternion = basis.to_quaternion()
            pb.keyframe_insert('rotation_quaternion', frame=f - f0, group=d)
            if d == 'pelvis':
                pb.location = basis.translation; pb.keyframe_insert('location', frame=f - f0, group=d)
    return out

def finish(pid, base, rig):
    # Keep only what's seen: drop the hidden base mesh, apply masks, rename for the web.
    for o in list(bpy.data.objects):
        if o.type == 'MESH' and o.parent is rig:
            bpy.context.view_layer.objects.active = o
            if o.data.shape_keys:  # bake the body-shape targets in so modifiers can be applied
                bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
            for md in list(o.modifiers):
                if md.type in ('MASK', 'SUBSURF'):
                    try: bpy.ops.object.modifier_apply(modifier=md.name)
                    except Exception: o.modifiers.remove(md)
    # Skin hidden under clothes: drop body faces whose vertices all see cloth just outside them along the normal.
    from mathutils.bvhtree import BVHTree
    import bmesh as _bm
    bpy.context.view_layer.update()
    cloth = [o for o in rig.children if o.type == 'MESH' and o is not base and any(k in o.name for k in ('shirt', 't-shirt', 'pants', 'jeans', 'trouser', 'sweater', 'dress', 'top', 'cardigan', 'polo', 'shoes', 'flats', 'boots'))]
    if cloth:
        bm = _bm.new()
        for o in cloth:
            t = _bm.new(); t.from_mesh(o.data); t.transform(o.matrix_world)
            me = bpy.data.meshes.new('tmp'); t.to_mesh(me); t.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        tree = BVHTree.FromBMesh(bm); bm.free()
        mw = base.matrix_world; nm = mw.to_3x3()
        hidden = set()
        for v in base.data.vertices:
            co = mw @ v.co; n = (nm @ v.normal).normalized()
            hit = tree.ray_cast(co, n, .06)
            if hit[0] is not None: hidden.add(v.index)
        b2 = _bm.new(); b2.from_mesh(base.data)
        dead = [f for f in b2.faces if all(v.index in hidden for v in f.verts)]
        _bm.ops.delete(b2, geom=dead, context='FACES'); b2.to_mesh(base.data); b2.free()
        print('HIDDEN', len(hidden), 'faces removed', len(dead))

    # Keep each piece light enough for phones: collapse-decimate anything heavy (weights survive decimation).
    BUDGET = {'Clothes': 2500, 'Hair': 2500}
    for o in list(rig.children):
        if o.type != 'MESH': continue
        n = len(o.data.polygons); cap = 5200 if o is base else 4800
        if n > cap:
            bpy.context.view_layer.objects.active = o
            d = o.modifiers.new('slim', 'DECIMATE'); d.ratio = cap / n
            bpy.ops.object.modifier_move_to_index(modifier='slim', index=0)
            bpy.ops.object.modifier_apply(modifier='slim')

    # Stand on the ground: the human is built centred on the hips, so lift the rig by the foot depth.
    bpy.context.view_layer.update()
    lo = min((o.matrix_world @ Vector(c)).z for o in rig.children if o.type == 'MESH' for c in o.bound_box)
    base.name = pid + '_body'
    rig.location.z -= lo
    rig.name = pid

def export(pid, rig):
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for o in rig.children: o.select_set(True)
    rig.animation_data.action = None
    for a in bpy.data.actions:
        if a.name in CLIPS:
            tr = rig.animation_data.nla_tracks.new(); tr.name = a.name; st = tr.strips.new(a.name, 0, a)
            if hasattr(st, 'action_slot') and len(a.slots): st.action_slot = a.slots[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{pid}.glb'), export_format='GLB', use_selection=True,
                              export_animations=True, export_animation_mode='NLA_TRACKS', export_apply=True,
                              export_yup=True, export_image_format='AUTO', export_force_sampling=True)

def preview(pid, rig):
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 48
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'; scene.view_settings.view_transform = 'AgX'
    scene.render.resolution_x, scene.render.resolution_y = 1200, 900
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (.9, .2, .6); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    cam.data.lens = 60
    shots = [('Walk_Loop', 8)] if os.environ.get('BONES') else [('REST', 0), ('Idle_Loop', 10), ('Walk_Loop', 8), ('Sitting_Idle_Loop', 10)]
    for clip, fr in shots:
        use_action(rig, bpy.data.actions[clip] if clip in bpy.data.actions else None)
        if clip == 'REST':
            for pb in rig.pose.bones: pb.matrix_basis = Matrix()
        scene.frame_set(fr)
        cam.location = (0, -3.2, 1.05); cam.rotation_euler = (math.radians(88), 0, 0)
        scene.render.filepath = os.path.join(OUT, f'{pid}-{clip}.png'); bpy.ops.render.render(write_still=True)
    hz = (rig.matrix_world @ rig.pose.bones['head'].head).z + .08
    cam.location = (0, -.75, hz); cam.rotation_euler = (math.radians(90), 0, 0)
    use_action(rig, bpy.data.actions.get('Idle_Loop')); scene.frame_set(10)
    scene.render.filepath = os.path.join(OUT, f'{pid}-face.png'); bpy.ops.render.render(write_still=True)

for spec in PEOPLE:
    if ONLY and spec[0] != ONLY: continue
    try:
        base, rig, proxy = build(spec)
        src = load_ual()
        for c in CLIPS:
            try: retarget(src, rig, c)
            except Exception as e: print('RETARGET_FAIL', spec[0], c, e)
        if os.environ.get('BONES2'):
            red = bpy.data.materials.new('dbg'); bsdf = red.node_tree.nodes['Principled BSDF']
            bsdf.inputs['Emission Color'].default_value = (1, .1, .1, 1); bsdf.inputs['Emission Strength'].default_value = 4
            blue = bpy.data.materials.new('dbg2'); b2 = blue.node_tree.nodes['Principled BSDF']
            b2.inputs['Emission Color'].default_value = (.1, .4, 1, 1); b2.inputs['Emission Strength'].default_value = 4
            use_action(src, bpy.data.actions['Walk_Loop']); use_action(rig, bpy.data.actions['Walk_Loop__rt']); bpy.context.scene.frame_set(8)
            for o in list(rig.children) + [base]: o.hide_render = True
            for arm, mat, off in ((rig, red, -.5), (src, blue, .5)):
                for pb in arm.pose.bones:
                    h, t = arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail
                    bpy.ops.mesh.primitive_cylinder_add(radius=.012, depth=max(.001, (t - h).length), location=(h + t) / 2 + Vector((off, 0, 0)))
                    c = bpy.context.object; c.rotation_euler = (t - h).to_track_quat('Z', 'Y').to_euler(); c.data.materials.append(mat)
            for o in src.children: o.hide_render = True
            scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.device = 'GPU'
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
            cam.location = (0, -4.5, .9); cam.rotation_euler = (math.radians(90), 0, 0); cam.data.lens = 40
            scene.render.resolution_x, scene.render.resolution_y = 1200, 900
            scene.render.filepath = os.path.join(OUT, 'bones2.png'); bpy.ops.render.render(write_still=True)
            cam.location = (4.5, 0, .9); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
            scene.render.filepath = os.path.join(OUT, 'bones2side.png'); bpy.ops.render.render(write_still=True)
            raise SystemExit
        # Swap the library's own actions out for the retargeted ones, under the clip names.
        for a_ in list(bpy.data.actions):
            if not a_.name.endswith('__rt'): bpy.data.actions.remove(a_)
        for a_ in bpy.data.actions: a_.name = a_.name[:-4]
        for o in list(src.children): bpy.data.objects.remove(o)
        bpy.data.objects.remove(src)
        for o in rig.children:
            if o.type == 'MESH': print('VG', o.name[-24:], [g.name for g in o.vertex_groups][:60])
        print('RIGLOC', rig.location[:], rig.data.bones['pelvis'].head_local[:], [(o.name[-12:], o.location[:], o.matrix_parent_inverse.translation[:]) for o in rig.children][:3])
        finish(spec[0], base, rig)
        use_action(rig, bpy.data.actions.get('Walk_Loop')); bpy.context.scene.frame_set(8)
        dg = bpy.context.evaluated_depsgraph_get()
        print('ACTIONS', [a_.name for a_ in bpy.data.actions], rig.animation_data.action and rig.animation_data.action.name)
        for o in rig.children:
            if o.type != 'MESH' or 'female1605' not in o.name and 't-shirt' not in o.name: continue
            ev = o.evaluated_get(dg); me = ev.to_mesh()
            for g in ('upperarm_l', 'hand_l', 'thigh_l'):
                vg = o.vertex_groups.get(g)
                if not vg: print('NOGROUP', o.name, g); continue
                idx = [v.index for v in o.data.vertices if any(e.group == vg.index and e.weight > .7 for e in v.groups)]
                if not idx: print('EMPTY', o.name, g); continue
                c = sum((o.matrix_world @ me.vertices[i].co for i in idx), Vector()) / len(idx)
                print('DEF', o.name[-20:], g, len(idx), [round(x, 2) for x in c], 'bone', [round(x, 2) for x in rig.matrix_world @ rig.pose.bones[g].head])
            ev.to_mesh_clear()
        if os.environ.get('BONES'):
            red = bpy.data.materials.new('dbg'); red.use_nodes = True; red.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0, 0, 1)
            red.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value = (1, 0, 0, 1); red.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 3
            for o in rig.children: o.hide_render = True
            for pb in rig.pose.bones:
                h, t = rig.matrix_world @ pb.head, rig.matrix_world @ pb.tail
                bpy.ops.mesh.primitive_cylinder_add(radius=.012, depth=max(.001, (t - h).length), location=(h + t) / 2)
                c = bpy.context.object; c.rotation_euler = (t - h).to_track_quat('Z', 'Y').to_euler(); c.data.materials.append(red)
        if os.environ.get('POSETEST'):
            use_action(rig, None)
            for pb in rig.pose.bones:
                if pb.name != 'Root': pb.matrix_basis = Matrix()
            bpy.context.view_layer.update()
            # rotate left upperarm down to the side by 40 degrees in world space about the forward axis
            pb = rig.pose.bones['upperarm_l']; m = pb.matrix.copy()
            r = Matrix.Rotation(math.radians(-40), 4, 'Y')
            pb.matrix = Matrix.Translation(m.translation) @ r @ Matrix.Translation(-m.translation) @ m
            bpy.context.view_layer.update()
            scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.cycles.device = 'GPU'
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
            cam.location = (0, -3.4, 1.0); cam.rotation_euler = (math.radians(88), 0, 0); cam.data.lens = 45
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3; sun.rotation_euler = (.9, .2, .6); scene.collection.objects.link(sun)
            scene.render.resolution_x, scene.render.resolution_y = 900, 900
            scene.render.filepath = os.path.join(OUT, 'posetest.png'); bpy.ops.render.render(write_still=True)
        if RENDER: preview(spec[0], rig)
        export(spec[0], rig)
        print('PERSON_OK', spec[0], sum(len(o.data.polygons) for o in rig.children if o.type == 'MESH'))
    except Exception as e:
        import traceback; traceback.print_exc(); print('PERSON_FAIL', spec[0], e)
