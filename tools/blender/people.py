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
EXPORT_CLIPS = CLIPS + ['Chop', 'Stir', 'Pack']
GREEN = '#2E8B57'  # volunteer t-shirts

# id, gender (0 woman, 1 man), age (0.5 = 25, 0.75 = ~50, 0.9 = ~70), weight, height, race, skin, hair, clothes [(name, tint)], role
PEOPLE = [
    ('v-maya',   0, .5,  .45, .45, 'asian',     'young_asian_female',          'ponytail01', [('joepal_crude_t-shirt_female', GREEN), ('punkduck_female_tight_jeans', None), ('toigo_flats', None)], 'volunteer'),
    ('v-james',  1, .7,  .6,  .6,  'african',   'middleage_african_male',      'short01',    [('namuhekam_male_polo_shirt', GREEN), ('punkduck_male_classic_jeans', None), ('shoes01', None)], 'volunteer'),
    ('v-linda',  0, .72, .6,  .45, 'caucasian', 'middleage_caucasian_female',  'bob02',      [('joepal_crude_t-shirt_female', GREEN), ('toigo_wool_pants', None), ('toigo_flats', None)], 'volunteer'),
    ('v-ravi',   1, .52, .5,  .55, 'asian',     'young_asian_male',            'culturalibre_hair_02', [('elvs_crude_t-shirt_male', GREEN), ('cortu_cargo_pants', None), ('shoes02', None)], 'volunteer'),
    ('v-priya',  0, .55, .5,  .4,  'asian',     'cutoff3d_indian_female_skin', 'elvs_french_braid_variation', [('joepal_crude_t-shirt_female', GREEN), ('mindfront_female_trousers_1', None), ('toigo_ballet_flats', None)], 'volunteer'),
    ('n-chen',   1, .9,  .45, .4,  'asian',     'old_asian_male',              'short02',    [('mindfront_knitted_sweater_01', None), ('mindfront_male_trousers_1', None), ('shoes03', None)], 'neighbour'),
    ('n-grace',  0, .9,  .65, .35, 'african',   'old_african_female',          'rehmanpolanski_hair_bun_brown', [('janexx_old_female_sweater', None), ('toigo_wool_pants', None), ('toigo_ballet_flats', None)], 'neighbour'),
    ('n-amara',  0, .45, .45, .5,  'african',   'young_african_female',        'ponytail01', [('punkduck_off-shoulder_long-sleeve_top', '#C8553D'), ('elvs_jeans_bootcut', None), ('toigo_flats', None)], 'neighbour', '#1C1612'),
    ('n-mei',    0, .7,  .5,  .4,  'asian',     'middleage_asian_female',      'culturalibre_hair_01', [('toigo_camisole_top', None), ('mindfront_cardigan_long_open_front', None), ('mindfront_female_trousers_1', None), ('toigo_flats', None)], 'neighbour'),
    ('n-marcus', 1, .48, .55, .6,  'african',   'young_african_male',          'short01',    [('elvs_crude_t-shirt_male', '#3B5B8C'), ('elvs_jeans_straight_leg', None), ('shoes04', None)], 'neighbour'),
    ('n-tom',    1, .75, .65, .55, 'caucasian', 'middleage_caucasian_male',    'culturalibre_hair_05', [('namuhekam_male_polo_shirt', '#9DB9D6'), ('mindfront_male_trousers_2', None), ('shoes05', None)], 'neighbour'),
    ('n-ruth',   0, .88, .55, .35, 'caucasian', 'old_caucasian_female',        'toigo_inverted_bob', [('mindfront_knitted_sweater_02', '#B8A48C'), ('toigo_wool_pants', None), ('toigo_flats', None)], 'neighbour'),
    ('n-sofia',  0, .48, .5,  .45, 'caucasian', 'toigo_light_skin_female_bronze', 'toigo_curled_under_bob', [('punkduck_lace_up_blouse', None), ('punkduck_female_tight_jeans', None), ('toigo_ankle_boots_female', None)], 'neighbour'),
    ('n-diego',  1, .58, .55, .5,  'caucasian', 'toigo_light_skin_male_bronze', 'short01',    [('elvs_male_shirt_untucked_bd1', None), ('elvs_male_trouser', None), ('shoes06', None)], 'neighbour'),
    ('n-aisha',  0, .66, .58, .45, 'african',   'middleage_african_female',    'elvs_reverse_french_braid_bun', [('punkduck_lace_up_blouse', '#D9A441'), ('toigo_wool_pants', '#3A4658'), ('toigo_ballet_flats', None)], 'neighbour', '#1C1612'),
    ('n-kenji',  1, .47, .48, .5,  'asian',     'young_asian_male',            'culturalibre_hair_02', [('elvs_hooded_sweat_jacket1', None), ('elvs_jeans_straight_leg', None), ('shoes02', None)], 'neighbour'),
    ('n-sam',    1, .88, .52, .45, 'caucasian', 'old_caucasian_male',          'short02',    [('mindfront_lusekofta', None), ('mindfront_male_trousers_1', None), ('shoes03', None)], 'neighbour'),
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

def tint(obj, hexcol, lighten=False, grey=False):
    # Multiply every image in the garment's materials by a colour (volunteers wear the green tee).
    for m in obj.data.materials:
        if not m or not m.node_tree: continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        inp = bsdf.inputs['Base Color']
        if grey:
            # Grey hair: recolour the texture itself (the glTF export keeps images, not shader nodes).
            import numpy as np
            for n in nt.nodes:
                if n.type != 'TEX_IMAGE' or not n.image: continue
                im = n.image.copy(); im.name = n.image.name + '_grey'
                px = np.empty(len(im.pixels), dtype=np.float32); im.pixels.foreach_get(px); px = px.reshape(-1, 4)
                lum = px[:, :3] @ np.array([.3, .59, .11], dtype=np.float32)
                g = np.clip(.42 + lum * 1.6, 0, 1)[:, None] * np.array([.93, .91, .88], dtype=np.float32)
                px[:, :3] = g; im.pixels.foreach_set(px.ravel()); im.pack(); n.image = im
            continue
        elif inp.is_linked:
            src = inp.links[0].from_socket
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'SCREEN' if lighten else 'MULTIPLY'; mix.inputs['Factor'].default_value = .8 if lighten else 1
            nt.links.new(src, mix.inputs['A']); mix.inputs['B'].default_value = (*srgb(hexcol), 1)
            nt.links.new(mix.outputs['Result'], inp)
        else:
            inp.default_value = (*srgb(hexcol), 1)

def build(spec, smile=0., hair_tint=None):
    pid, gender, age, weight, height, race, skin, hair, clothes, role = spec[:10]
    if len(spec) > 10 and not hair_tint: hair_tint = spec[10]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    macro = TS.get_default_macro_info_dict()
    macro.update(gender=float(gender), age=age, weight=min(.62, max(.42, weight)), height=height, muscle=.5, proportions=1.)
    macro['race'] = {'asian': 0., 'caucasian': 0., 'african': 0.}; macro['race'][race] = 1.
    # Detailed helpers carry MakeHuman's joint markers; without them the rig falls back to one default body's joints.
    base = HS.create_human(macro_detail_dict=macro, scale=0.1, mask_helpers=True, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=False)
    HS.add_builtin_rig(base, 'game_engine')
    rig = base.parent
    proxy = None  # the full body mesh keeps a far better face than the low-poly proxies; it is decimated evenly later
    HS.set_character_skin(asset('skins', skin, 'mhmat'), base, skin_type='MAKESKIN')
    HS.add_mhclo_asset(asset('eyes', 'high-poly'), base, asset_type='Eyes', subdiv_levels=0)
    HS.add_mhclo_asset(asset('eyebrows', 'eyebrow00%d' % (1 + hash(pid) % 9)), base, asset_type='Eyebrows', subdiv_levels=0)
    HS.add_mhclo_asset(asset('eyelashes', 'eyelashes01'), base, asset_type='Eyelashes', subdiv_levels=0)
    ho = HS.add_mhclo_asset(asset('hair', hair), base, asset_type='Hair', subdiv_levels=0)
    if hair_tint and ho: tint(ho, hair_tint.lstrip('+~'), lighten=hair_tint.startswith('+'), grey=hair_tint.startswith('~'))
    if smile:
        TD = os.path.join(os.environ['APPDATA'], 'Blender Foundation', 'Blender', '5.1', 'extensions', 'user_default', 'mpfb', 'data', 'targets')
        for t, w in (('mouth/mouth-angles-up', smile), ('mouth/mouth-laugh-lines-in', smile * .6), ('mouth/mouth-dimples-in', smile * .5), ('cheek/r-cheek-bones-incr', smile * .3), ('cheek/l-cheek-bones-incr', smile * .3)):
            pth = os.path.join(TD, t + '.target.gz')
            if os.path.exists(pth): TS.load_target(base, pth, weight=w)
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
        if o is not arm and o.type == 'MESH' and not os.environ.get('CMP'): bpy.data.objects.remove(o)
    return arm

RS = svc.RigService
TPOSE = os.path.join(os.environ['APPDATA'], 'Blender Foundation', 'Blender', '5.1', 'extensions', 'user_default', 'mpfb', 'data', 'poses', 'game_engine_fk', 't-pose.json')
REF = {}
CURL = float(os.environ.get('CURL', '1'))
RTF = os.environ.get('RTF', '0') == '1'
# Aim each bone at its child joint; a second joint pins the twist (pelvis by the hips, forearm and hand by the palm, foot by the toes).
def _aim(side):
    o = {'pelvis': ('spine_01', ('thigh_r', 'thigh_l')), 'spine_01': ('spine_02', None), 'spine_02': ('spine_03', None), 'spine_03': ('neck_01', ('clavicle_r', 'clavicle_l')),
         'neck_01': ('head', None)}
    for x in ('l', 'r'):
        o.update({f'clavicle_{x}': (f'upperarm_{x}', None), f'upperarm_{x}': (f'lowerarm_{x}', None), f'lowerarm_{x}': (f'hand_{x}', (f'pinky_01_{x}', f'index_01_{x}')),
                  f'hand_{x}': (f'middle_01_{x}', (f'pinky_01_{x}', f'index_01_{x}')), f'thigh_{x}': (f'calf_{x}', None), f'calf_{x}': (f'foot_{x}', None),
                  f'foot_{x}': (f'ball_{x}', None)})
        for f in ('index', 'middle', 'ring', 'pinky', 'thumb'):
            o[f'{f}_01_{x}'] = (f'{f}_02_{x}', None); o[f'{f}_02_{x}'] = (f'{f}_03_{x}', None)
    return o
AIM = _aim(None)

def frame(a, u):
    a = a.normalized(); u = (u - a * u.dot(a)).normalized(); return Matrix((a, u, a.cross(u))).transposed()

def references(src, dst):
    # Bring MakeHuman's rig into the library's own T-pose bone by bone (aim at the child joint, twist from a second joint),
    # so motion copied as a world-space change from that shared pose lands with the same elbows, palms, knees and feet.
    if REF: return REF
    use_action(src, bpy.data.actions['A_TPose']); bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
    sref = {b.name.lower(): b.matrix.copy() for b in src.pose.bones}
    use_action(dst, None)
    for pb in dst.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        if pb.name != 'Root': pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    rest = {b.name: b.matrix.copy() for b in dst.pose.bones}
    order = [b.name for b in dst.data.bones]
    sh = lambda n: sref[n.lower()].translation
    for d in order:
        if d not in AIM or d.lower() not in sref: continue
        child, two = AIM[d]
        pb = dst.pose.bones[d]; bpy.context.view_layer.update()
        dh = lambda n: dst.pose.bones[n].matrix.translation if n != d else pb.matrix.translation
        ca = (dh(child) - pb.matrix.translation) if d != 'pelvis' else dh(child) - (dh('thigh_l') + dh('thigh_r')) / 2
        ta = (sh(child) - sh(d)) if d != 'pelvis' else sh(child) - (sh('thigh_l') + sh('thigh_r')) / 2
        if two:
            r = frame(ta, sh(two[1]) - sh(two[0])) @ frame(ca, dh(two[1]) - dh(two[0])).inverted()
        else:
            r = ca.rotation_difference(ta).to_matrix()
        m = pb.matrix.copy(); t = m.translation.copy()
        pb.matrix = Matrix.Translation(t) @ (r @ m.to_3x3()).to_4x4()
    bpy.context.view_layer.update()
    tref = {b.name: b.matrix.copy() for b in dst.pose.bones}
    for pb in dst.pose.bones:
        if pb.name != 'Root': pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    REF.update(s={b.name: sref[b.name.lower()] for b in src.pose.bones}, t=tref, rest={b.name: b.matrix.copy() for b in dst.pose.bones})
    return REF

def retarget(src, dst, clip):
    act = bpy.data.actions.get(clip)
    if not act: return None
    ref = references(src, dst)
    names = {b.name.lower(): b.name for b in src.data.bones}
    FINGERS = ('index', 'middle', 'ring', 'pinky', 'thumb')
    pairs = [(b.name, names[b.name.lower()]) for b in dst.data.bones if b.name.lower() in names and b.name.lower() != 'root' and (RTF or not b.name.startswith(FINGERS))]
    fingers = [b.name for b in dst.data.bones if b.name.startswith(FINGERS)]
    order = [b.name for b in dst.data.bones]
    pairs.sort(key=lambda p: order.index(p[0]))
    sp = names['pelvis']
    sfoot = min(ref['s'][names['foot_l']].translation.z, ref['s'][names['foot_r']].translation.z)
    tfoot = min(ref['t']['foot_l'].translation.z, ref['t']['foot_r'].translation.z)
    k = (ref['t']['pelvis'].translation.z - tfoot) / max(1e-4, ref['s'][sp].translation.z - sfoot)
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
            rot = spb.matrix.to_quaternion() @ ref['s'][s].to_quaternion().inverted() @ ref['t'][d].to_quaternion()
            bone = dst.data.bones[d]; par = bone.parent
            rest_rel = par.matrix_local.inverted() @ bone.matrix_local if par else bone.matrix_local
            pw = world.get(par.name) if par else None
            if pw is None and par:
                # Parent isn't driven (e.g. MetaHuman's extra spine_04/05 and neck_02): carry it along from its
                # nearest driven ancestor with its rest offset, so children follow the bent spine instead of the rest pose.
                chain = []; a_ = par
                while a_ is not None and a_.name not in world: chain.append(a_); a_ = a_.parent
                pw = world[a_.name] if a_ is not None else ref['rest'][chain.pop().name]
                for cb in reversed(chain): pw = pw @ (cb.parent.matrix_local.inverted() @ cb.matrix_local)
            if pw is None: pw = Matrix()
            if d == 'pelvis':
                head = ref['rest'][d].translation + (spb.matrix.translation - ref['s'][s].translation) * k
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
        if f == f0 and not RTF:
            # Relaxed hands: a gentle, even curl instead of copying the mannequin's finger keys.
            for fb in fingers:
                pb = dst.pose.bones[fb]; seg = int(fb.split('_')[1]) if fb.split('_')[1].isdigit() else 1
                ang = (.12 if fb.startswith('thumb') else .22 + .08 * seg)
                pb.rotation_quaternion = Quaternion((1, 0, 0), ang * CURL)
                pb.keyframe_insert('rotation_quaternion', frame=0, group=fb)
    return out

def ik_pose(rig, targets, poles=None):
    # Arms reach for world-space hand targets with two-bone IK; returns the constraints so they can be baked or removed.
    cons = []
    for side, pos in targets.items():
        e = bpy.data.objects.new(f'ik_{side}', None); bpy.context.scene.collection.objects.link(e); e.location = pos
        c = rig.pose.bones[f'lowerarm_{side}'].constraints.new('IK'); c.target = e; c.chain_count = 2
        if poles and side in poles:
            pe = bpy.data.objects.new(f'pole_{side}', None); bpy.context.scene.collection.objects.link(pe); pe.location = poles[side]
            c.pole_target = pe; c.pole_angle = math.radians(-90)
        cons.append((c, e))
    return cons

def palm(rig, side, aim, inward):
    # A world rotation for the hand: fingers along aim, thumb side toward inward (rest-pose hand frame carried over).
    bn = lambda n: rig.data.bones[f'{n}_{side}'].head_local
    hb = rig.data.bones[f'hand_{side}']
    r = frame(Vector(aim), Vector(inward)) @ frame(bn('middle_01') - bn('hand'), bn('index_01') - bn('pinky_01')).inverted()
    return (r @ hb.matrix_local.to_3x3()).to_quaternion()

def lean(rig, src, name, spine=9., neck=14.):
    # The idle with the back bent a little over the counter and the head looking down at the work.
    act = src.copy(); act.name = name; act.use_fake_user = True
    use_action(rig, act); sc = bpy.context.scene
    f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
    for bnm, deg in (('spine_02', spine * .5), ('spine_03', spine * .5), ('neck_01', neck * .6), ('head', neck * .4)):
        pb = rig.pose.bones[bnm]; pb.rotation_mode = 'QUATERNION'
        for f in range(f0, f1 + 1):
            sc.frame_set(f); q = pb.rotation_quaternion @ Quaternion((1, 0, 0), math.radians(deg))
            pb.rotation_quaternion = q; pb.keyframe_insert('rotation_quaternion', frame=f, group=bnm)
    return act

def work_clip(rig, name, hands, n=48, palms=None):
    # A kitchen task on top of the leaning idle: hands follow small loops (chopping, stirring, packing) around a rest spot
    # just in front of each elbow, so the forearms stay about level whatever the person's size. Baked to plain keys.
    scene = bpy.context.scene
    use_action(rig, bpy.data.actions['WorkIdle'])
    scene.frame_set(0); bpy.context.view_layer.update()
    W = lambda b: rig.matrix_world @ rig.pose.bones[b].head
    base = {}
    for sd in ('l', 'r'):
        el, hd, shd = W(f'lowerarm_{sd}'), W(f'hand_{sd}'), W(f'upperarm_{sd}')
        fl = (hd - el).length; inward = -1 if sd == 'l' else 1
        base[sd] = (Vector((el.x + inward * .06, shd.y - fl * .95, el.z + .02)), fl)
    poles = {sd: Vector((W(f'lowerarm_{sd}').x + (.06 if sd == 'l' else -.06), W(f'lowerarm_{sd}').y + .6, W(f'lowerarm_{sd}').z - .6)) for sd in base}
    cons = ik_pose(rig, {sd: base[sd][0] for sd in hands(0)}, poles)
    for sd, (aim, inward) in (palms or {}).items():
        e = bpy.data.objects.new(f'ik_rot_{sd}', None); scene.collection.objects.link(e)
        e.rotation_mode = 'QUATERNION'; e.rotation_quaternion = palm(rig, sd, aim, inward)
        c = rig.pose.bones[f'hand_{sd}'].constraints.new('COPY_ROTATION'); c.target = e; c.influence = 1.
    for f in range(n):
        for (c, e), (sd, p) in zip(cons, hands(f).items()):
            b, fl = base[sd]; e.location = b + Vector(p) * (fl / .26)
            e.keyframe_insert('location', frame=f)
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=0, frame_end=n - 1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = rig.animation_data.action; act.name = name; act.use_fake_user = True
    for c, e in cons: bpy.data.objects.remove(e)
    for o in [o for o in bpy.data.objects if o.name.startswith(('pole_', 'ik_rot_'))]: bpy.data.objects.remove(o)
    use_action(rig, None)

def add_work(rig):
    # Offsets (metres for an average forearm) from each hand's rest spot in front of the elbow.
    T2 = 2 * math.pi
    lean(rig, bpy.data.actions['Idle_Loop'], 'WorkIdle')
    down = {'l': ((-.15, -.97, -.12), (-1, 0, 0)), 'r': ((.15, -.97, -.12), (1, 0, 0))}
    work_clip(rig, 'Chop', lambda f: {'r': (0, 0, .07 * max(0., math.sin(T2 * f / 12))), 'l': (.02, .02, -.01)}, 48, down)
    work_clip(rig, 'Stir', lambda f: {'r': (.06 * math.cos(T2 * f / 32), -.06 + .05 * math.sin(T2 * f / 32), .1), 'l': (0, .03, 0)}, 64,
              {'r': ((0, -.3, -.95), (0, -1, 0)), 'l': down['l']})
    work_clip(rig, 'Pack', lambda f: {sd: (0, -.1 * (.5 - .5 * math.cos(T2 * f / 48)), -.03 * math.sin(T2 * f / 48)) for sd in ('l', 'r')}, 48, down)

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
    cloth = [o for o in rig.children if o.type == 'MESH' and o is not base and any(k in o.name for k in ('shirt', 't-shirt', 'pants', 'jeans', 'trouser', 'sweater', 'dress', 'top', 'cardigan', 'polo', 'shoes', 'flats', 'boots', 'blouse', 'jacket', 'lusekofta'))]
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

    # Clothes worn over other clothes: drop faces of the inner garment (trousers, camisole) hidden under the outer one.
    def bvh(objs):
        bm = _bm.new()
        for o in objs:
            t = _bm.new(); t.from_mesh(o.data); t.transform(o.matrix_world)
            me = bpy.data.meshes.new('tmp'); t.to_mesh(me); t.free(); bm.from_mesh(me); bpy.data.meshes.remove(me)
        tr = BVHTree.FromBMesh(bm); bm.free(); return tr
    tops = [o for o in cloth if any(k in o.name for k in ('shirt', 'sweater', 'cardigan', 'polo', 'lusekofta', 'blouse', 'jacket', 'off-shoulder'))]
    inner = [o for o in cloth if o not in tops and not any(k in o.name for k in ('shoe', 'flats', 'boots'))]
    if tops and inner:
        tr = bvh(tops)
        for o in inner:
            mw = o.matrix_world; nm = mw.to_3x3()
            def covered(v):
                co = mw @ v.co; n = (nm @ v.normal).normalized()
                # under the top, or poking just through it (the top is a little inside this garment here)
                return tr.ray_cast(co, n, .05)[0] is not None or tr.ray_cast(co, -n, .025)[0] is not None
            cov = {v.index for v in o.data.vertices if covered(v)}
            b3 = _bm.new(); b3.from_mesh(o.data)
            dead = [f for f in b3.faces if all(v.index in cov for v in f.verts)]
            _bm.ops.delete(b3, geom=dead, context='FACES'); b3.to_mesh(o.data); b3.free()
            print('LAYER', o.name[-20:], len(dead))

    # Keep each piece light enough for phones: collapse-decimate anything heavy (weights survive decimation).
    BUDGET = {'Clothes': 2500, 'Hair': 2500}
    for o in list(rig.children):
        if o.type != 'MESH': continue
        n = len(o.data.polygons)
        cap = 16000 if o is base else 1500 if any(k in o.name for k in ('shoe', 'flats', 'boots')) else 9000
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
        if a.name in EXPORT_CLIPS:
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
    shots = [('Walk_Loop', 8)] if os.environ.get('BONES') else [('Walk_Loop', 8), ('Sitting_Idle_Loop', 10), ('Chop', 3), ('Stir', 8), ('Pack', 24)]
    for clip, fr in shots:
        use_action(rig, bpy.data.actions[clip] if clip in bpy.data.actions else None)
        if clip == 'REST':
            for pb in rig.pose.bones: pb.matrix_basis = Matrix()
        scene.frame_set(fr)
        cam.location = (0, -3.2, 1.05); cam.rotation_euler = (math.radians(88), 0, 0)
        scene.render.filepath = os.path.join(OUT, f'{pid}-{clip}.png'); bpy.ops.render.render(write_still=True)
        if clip in ('Chop', 'Stir', 'Pack', 'Walk_Loop'):
            cam.location = (3.2, 0, 1.05); cam.rotation_euler = (math.radians(88), 0, math.radians(90))
            scene.render.filepath = os.path.join(OUT, f'{pid}-{clip}-side.png'); bpy.ops.render.render(write_still=True)
    hz = (rig.matrix_world @ rig.pose.bones['head'].head).z + .1
    use_action(rig, bpy.data.actions.get('Idle_Loop')); scene.frame_set(10); bpy.context.view_layer.update()
    hc = rig.matrix_world @ ((rig.pose.bones['head'].head + rig.pose.bones['head'].tail) / 2)
    cam.location = (hc.x, hc.y - .7, hc.z + .02); cam.rotation_euler = (math.radians(90), 0, 0)
    scene.render.filepath = os.path.join(OUT, f'{pid}-face.png'); bpy.ops.render.render(write_still=True)

for spec in PEOPLE:
    if ONLY and ONLY != 'people' and spec[0] != ONLY: continue
    try:
        base, rig, proxy = build(spec)
        REF.clear(); src = load_ual()
        for c in CLIPS:
            try: retarget(src, rig, c)
            except Exception as e: print('RETARGET_FAIL', spec[0], c, e)
        if os.environ.get('CMP'):
            # Side by side: the library's own mannequin (right) and our person (left), same clip and frame.
            src.location.x = 1.0
            for o in src.children: o.hide_render = False
            use_action(src, bpy.data.actions[os.environ['CMP']]); use_action(rig, bpy.data.actions[os.environ['CMP'] + '__rt'])
            scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 16; scene.cycles.device = 'GPU'
            prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
            for d in prefs.devices: d.use = d.type == 'OPTIX'
            w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
            cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
            scene.render.resolution_x, scene.render.resolution_y = 800, 600
            sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (.8, .2, .5); scene.collection.objects.link(sun)
            scene.view_settings.view_transform = 'Standard'
            mine = [o for o in rig.children]; theirs = [o for o in src.children]
            for f in [int(x) for x in os.environ.get('FRAMES', '0,6,12,18').split(',')]:
                scene.frame_set(f)
                for bn in ('spine_03', 'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l', 'thigh_l', 'calf_l', 'foot_l'):
                    ch = AIM[bn][0]; sb = {b.name.lower(): b for b in src.pose.bones}
                    dv = rig.pose.bones[ch].head - rig.pose.bones[bn].head; sv = sb[ch].head - sb[bn].head
                    print('DBG ANG', f, bn, round(math.degrees(dv.angle(sv)), 1), [round(x, 2) for x in dv.normalized()], [round(x, 2) for x in sv.normalized()])
                cam.location = (.5, -4.2, .95); cam.rotation_euler = (math.radians(90), 0, 0); cam.data.lens = float(os.environ.get('LENS', '40'))
                if os.environ.get('CAMZ'): cam.location = (float(os.environ.get('CAMX', '.5')), -4.2, float(os.environ['CAMZ']))
                for o in mine + theirs: o.hide_render = False
                scene.render.filepath = os.path.join(OUT, f'cmp-front-{f:02d}.png'); bpy.ops.render.render(write_still=True)
                for nm, hide in (('side', theirs), ('sideref', mine)):
                    for o in mine + theirs: o.hide_render = o in hide
                    x = 1.0 if nm == 'sideref' else 0
                    cam.location = (x + 4.2, 0, .95); cam.rotation_euler = (math.radians(90), 0, math.radians(90))
                    scene.render.filepath = os.path.join(OUT, f'cmp-{nm}-{f:02d}.png'); bpy.ops.render.render(write_still=True)
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
        if spec[9] == 'volunteer': add_work(rig)
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

# =====================================================================
# The donate moment, posed and frozen: an Indian grandmother (a volunteer) hands a meal box across the table
# to a young mother holding her baby on her hip. Static meshes in web-scene coordinates, one GLB each.
def bake_static(rig, pid, loc3, face_back=False):
    # Freeze the current pose (manual rotations and IK) into a one-frame 'Pose' clip, place the figure, export it skinned.
    for o in bpy.context.selected_objects: o.select_set(False)
    bpy.context.view_layer.objects.active = rig; rig.select_set(True)
    bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=0, frame_end=1, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=False, bake_types={'POSE'})
    bpy.ops.object.mode_set(mode='OBJECT')
    act = rig.animation_data.action; act.name = 'Pose'; act.use_fake_user = True
    for o in [o for o in bpy.data.objects if o.name.startswith(('ik_', 'pole_'))]: bpy.data.objects.remove(o)
    rig.location.x, rig.location.y = loc3[0], -loc3[2]
    rig.rotation_euler.z = math.pi if face_back else 0
    rig.animation_data.action = None
    tr = rig.animation_data.nla_tracks.new(); tr.name = 'Pose'; st = tr.strips.new('Pose', 0, act)
    if hasattr(st, 'action_slot') and len(act.slots): st.action_slot = act.slots[0]
    for o in bpy.context.selected_objects: o.select_set(False)
    rig.select_set(True)
    for o in rig.children: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{pid}.glb'), export_format='GLB', use_selection=True, export_animations=True,
                              export_animation_mode='NLA_TRACKS', export_apply=True, export_yup=True, export_image_format='AUTO', export_force_sampling=True)
    print('STATIC_OK', pid)

def pose_bone(rig, name, axis, deg):
    pb = rig.pose.bones[name]; pb.rotation_mode = 'QUATERNION'
    pb.rotation_quaternion = pb.rotation_quaternion @ Quaternion(Vector(axis), math.radians(deg))

def apply_ik(rig, targets, poles, palms=None):
    # Constraints stay live; bake_static captures them visually. Palms turn each hand to a world orientation.
    ik_pose(rig, targets, poles)
    for sd, (aim, inward) in (palms or {}).items():
        e = bpy.data.objects.new(f'ik_rot_{sd}', None); bpy.context.scene.collection.objects.link(e)
        e.rotation_mode = 'QUATERNION'; e.rotation_quaternion = palm(rig, sd, aim, inward)
        c = rig.pose.bones[f'hand_{sd}'].constraints.new('COPY_ROTATION'); c.target = e
    bpy.context.view_layer.update()

def relax_hands(rig, curl=1.):
    for b in rig.pose.bones:
        if b.name.startswith(('index', 'middle', 'ring', 'pinky')):
            seg = int(b.name.split('_')[1]); b.rotation_mode = 'QUATERNION'; b.rotation_quaternion = Quaternion((1, 0, 0), (.25 + .12 * seg) * curl)

def to_height(rig, h):
    # MakeHuman builds these bodies small; scale the whole figure (rig and all) to a real standing height.
    bpy.context.view_layer.update()
    zs = [(o.matrix_world @ Vector(c)).z for o in rig.children if o.type == 'MESH' for c in o.bound_box]
    k = h / (max(zs) - min(zs)); rig.scale = (k, k, k); rig.location.z *= k; bpy.context.view_layer.update()
    return k

def knit(hexcol):
    m = bpy.data.materials.new('Blanket'); m.use_nodes = True; bs = m.node_tree.nodes['Principled BSDF']
    bs.inputs['Base Color'].default_value = (*srgb(hexcol), 1); bs.inputs['Roughness'].default_value = .95
    wv = m.node_tree.nodes.new('ShaderNodeTexWave'); wv.inputs['Scale'].default_value = 90; bp = m.node_tree.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .3
    m.node_tree.links.new(wv.outputs['Fac'], bp.inputs['Height']); m.node_tree.links.new(bp.outputs['Normal'], bs.inputs['Normal'])
    return m

def hull_mesh(name, pts, drop=None, grow=1., centre=None, mat=None, thick=0., smooth=6):
    # A soft shell around a point cloud: convex hull, optional opening (faces whose normal points along drop), subdivided and puffed out.
    import bmesh as _b
    bm = _b.new()
    for p in pts: bm.verts.new(p)
    _b.ops.convex_hull(bm, input=bm.verts)
    bm.faces.ensure_lookup_table()
    loose = [v for v in bm.verts if not v.link_faces]; _b.ops.delete(bm, geom=loose, context='VERTS')
    if drop is not None:
        bm.normal_update(); _b.ops.delete(bm, geom=[f for f in bm.faces if f.normal.dot(drop) > .55], context='FACES')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    c = centre if centre is not None else sum(pts, Vector()) / len(pts)
    for v in me.vertices: v.co = c + (v.co - c) * grow
    sd = o.modifiers.new('sub', 'SUBSURF'); sd.levels = 3
    sm = o.modifiers.new('soft', 'SMOOTH'); sm.iterations = smooth; sm.factor = .8
    if thick: so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1
    if mat: me.materials.append(mat)
    for poly in me.polygons: poly.use_smooth = True
    return o

def freeze_meshes(rig):
    # Bake the current pose into plain meshes and drop the rig (for the baby, which never moves).
    dg = bpy.context.evaluated_depsgraph_get(); out = []
    for o in [o for o in rig.children if o.type == 'MESH']:
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg)); mw = o.matrix_world.copy()
        n = bpy.data.objects.new(o.name, me); bpy.context.scene.collection.objects.link(n); n.matrix_world = mw
        out.append(n); bpy.data.objects.remove(o)
    return out

DONATE = {
    'd-dadi': (('d-dadi', 0, .95, .55, .3, 'asian', 'cutoff3d_indian_female_enhanced', 'rehmanpolanski_hair_bun_brown',
                [('joepal_crude_t-shirt_female', GREEN), ('toigo_wool_pants', '#5A4A3E'), ('toigo_ballet_flats', None)], 'volunteer'), '~#ffffff'),
    'd-mom': (('d-mom', 0, .42, .5, .5, 'african', 'callharvey3d_midtoned_female', 'ponytail01',
               [('toigo_camisole_top', '#C96B4A'), ('mindfront_cardigan_long_open_front', '#7D93AB'), ('punkduck_female_tight_jeans', None), ('toigo_flats', None)], 'neighbour'), None),
    'd-baby': (('d-baby', 1, 0., .55, .5, 'african', 'callharvey3d_midtoned_female', 'short01', [], 'neighbour'), '#2A211C'),
}
# Three.js coordinates: the box (web side) sits at (4.32, .99, 1.6), .3 wide, .24 deep; the grandmother stands at z 1.08
# behind the table and the mother at z 2.3 on the street side, facing her.
MOM = {}
if ONLY in ('donate', None):
    for pid, (spec, htint) in DONATE.items():
        try:
            base, rig, _ = build(spec, smile=.9 if pid != 'd-baby' else .6, hair_tint=htint)
            finish(pid, base, rig)
            use_action(rig, None)
            for pb in rig.pose.bones:
                pb.rotation_mode = 'QUATERNION'
                if pb.name != 'Root': pb.matrix_basis = Matrix()
            bpy.context.view_layer.update()
            if pid == 'd-dadi':
                # Leaning in a little over the table, both hands palm-up under the near edge of the box, holding it out.
                to_height(rig, 1.55)
                pose_bone(rig, 'spine_02', (1, 0, 0), 6); pose_bone(rig, 'spine_03', (1, 0, 0), 4); pose_bone(rig, 'neck_01', (1, 0, 0), 4)
                W = lambda b: rig.matrix_world @ rig.pose.bones[b].head
                apply_ik(rig, {'r': Vector((-.1, -.47, .945)), 'l': Vector((.1, -.47, .945))},
                         {sd: W(f'lowerarm_{sd}') + Vector(((.08 if sd == 'l' else -.08), .5, -.5)) for sd in ('l', 'r')},
                         {'l': ((0, -1, .05), (1, 0, 0)), 'r': ((0, -1, .05), (-1, 0, 0))})
                relax_hands(rig, .45); bake_static(rig, pid, (4.32, 0, 1.08))
            elif pid == 'd-mom':
                # Right hand taking the far edge of the box; left forearm level across her front, cradling the baby.
                to_height(rig, 1.65)
                pose_bone(rig, 'spine_02', (1, 0, 0), 7); pose_bone(rig, 'spine_03', (1, 0, 0), 4); pose_bone(rig, 'neck_01', (1, 0, 0), 4); pose_bone(rig, 'head', (0, 0, 1), -6)
                W = lambda b: rig.matrix_world @ rig.pose.bones[b].head
                el = W('lowerarm_l')
                apply_ik(rig, {'r': Vector((-.04, -.5, 1.0)), 'l': Vector((-.07, el.y - .2, el.z - .06))},
                         {'r': W('lowerarm_r') + Vector((-.1, .5, -.5)), 'l': el + Vector((.5, .2, -.3))},
                         {'r': ((-.1, -.95, -.25), (1, 0, 0)), 'l': ((-1, -.15, 0), (0, -1, 0))})
                relax_hands(rig, 1.); bpy.context.view_layer.update()
                MOM.update(elbow=W('lowerarm_l').copy(), hand=W('hand_l').copy(), shoulder=W('upperarm_l').copy(), chest=W('spine_03').copy())
                bake_static(rig, pid, (4.32, 0, 2.25), face_back=True)
            else:
                # The baby, arms folded on the chest, wrapped in a knit swaddle with a hood around the face,
                # lying along mum's left forearm with the head in the crook of her elbow, face turned up.
                for o in [o for o in rig.children if o.type == 'MESH' and 'short01' in o.name]: bpy.data.objects.remove(o)
                W = lambda b: rig.matrix_world @ rig.pose.bones[b].head
                hc = (W('head') + rig.matrix_world @ rig.pose.bones['head'].tail) / 2
                neck_z = W('neck_01').z; hip_z = W('pelvis').z
                apply_ik(rig, {'l': W('spine_03') + Vector((.03, -.06, .0)), 'r': W('spine_03') + Vector((-.03, -.07, .02))},
                         {'l': W('lowerarm_l') + Vector((.2, .1, -.2)), 'r': W('lowerarm_r') + Vector((-.2, .1, -.2))})
                bpy.context.view_layer.update()
                meshes = freeze_meshes(rig); bpy.data.objects.remove(rig)
                body = next(o for o in meshes if '_body' in o.name)
                pts = [body.matrix_world @ v.co for v in body.data.vertices]
                F = Vector((0, -1, 0))
                # A soft tapered bundle from the chin to just past the toes, as wide as the shoulders.
                below = [p for p in pts if p.z < neck_z + .005]
                lo_z = min(p.z for p in below) - .02; top_z = neck_z + .01
                wx = (max(p.x for p in below if p.z > hip_z) - min(p.x for p in below if p.z > hip_z)) / 2 + .015
                wy = (max(p.y for p in below if p.z > hip_z) - min(p.y for p in below if p.z > hip_z)) / 2 + .02
                cy = sum(p.y for p in below if p.z > hip_z) / max(1, len([p for p in below if p.z > hip_z]))
                bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=24, radius=1, location=(hc.x, cy, (lo_z + top_z) / 2))
                swaddle = bpy.context.object; swaddle.name = 'Swaddle'; half = (top_z - lo_z) / 2
                for v in swaddle.data.vertices:
                    t = (v.co.z + 1) / 2                        # 0 at the feet, 1 at the chin
                    k_ = .72 + .28 * min(1, t * 1.5) ** .7        # tapering a little toward the feet
                    v.co.x *= wx * .85 * k_; v.co.y *= wy * .9 * k_ * (1 - .12 * max(0, t - .8) / .2); v.co.z *= half
                swaddle.data.materials.append(knit('#F2DFA4'))
                for poly in swaddle.data.polygons: poly.use_smooth = True
                hood = hull_mesh('Hood', [p for p in pts if p.z > neck_z - .03 and (p - hc).dot(F) < .01], drop=F, grow=1.14, centre=hc, mat=knit('#F2DFA4'), thick=.008)
                import bmesh as _b
                for o in meshes:   # keep only the head and face; the swaddle covers the rest
                    b = _b.new(); b.from_mesh(o.data); b.transform(o.matrix_world)
                    _b.ops.delete(b, geom=[v for v in b.verts if v.co.z < neck_z - .01 or (v.co - hc).length > .14], context='VERTS')
                    b.transform(o.matrix_world.inverted()); b.to_mesh(o.data); b.free()
                keep = meshes + [swaddle, hood]
                # Baby's own frame: head centre, body axis (head to feet) and face direction; held upright on mum's left shoulder.
                feet = min(pts, key=lambda p: p.z); axis = Vector((0, 0, -1)); L = hc.z - feet.z
                k = .52 / (L + .1)   # about 52 cm from crown to toes
                el, hd = MOM['elbow'], MOM['hand']
                along = Vector([float(x) for x in os.environ.get('BAL', '0,.2,-1').split(',')]).normalized()   # upright against her chest, leaning back on her
                up = Vector([float(x) for x in os.environ.get('BUP', '1,-.7,0').split(',')]).normalized(); up = (up - along * up.dot(along)).normalized()   # looking out past her shoulder toward the grandmother
                src = Matrix((axis, F, axis.cross(F))).transposed(); dst = Matrix((along, up, along.cross(up))).transposed()
                sh_, ch_ = MOM['shoulder'], MOM['chest']
                cradle = Vector((sh_.x * .55, ch_.y, sh_.z)) + Vector([float(x) for x in os.environ.get('BCR', '0,-.17,.1').split(',')])
                local = Matrix.Translation(cradle) @ (dst @ src.inverted()).to_4x4() @ Matrix.Scale(k, 4) @ Matrix.Translation(-hc)
                mom = Matrix.Translation(Vector((4.32, -2.25, 0))) @ Matrix.Rotation(math.pi, 4, 'Z')
                for o in keep:
                    for md in [m for m in o.modifiers if m.type != 'ARMATURE']:
                        bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier=md.name)
                    o.matrix_world = mom @ local @ o.matrix_world
                for ob in bpy.context.selected_objects: ob.select_set(False)
                for o in keep: o.select_set(True)
                bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'd-baby.glb'), export_format='GLB', use_selection=True, export_apply=True, export_yup=True, export_image_format='AUTO')
                print('STATIC_OK', pid)
        except Exception as e:
            import traceback; traceback.print_exc(); print('STATIC_FAIL', pid, e)

if os.environ.get('DPREV') and ONLY == 'donate':
    # Look at the three together from the web camera's side.
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for f in ('d-dadi', 'd-mom', 'd-baby'): bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, f + '.glb'))
    bpy.context.scene.frame_set(0); bpy.context.view_layer.update()
    for a in [o for o in bpy.data.objects if o.type == 'ARMATURE']:
        print('DBG ARM', a.name, {b: [round(x, 2) for x in a.matrix_world @ a.pose.bones[b].head] for b in ('hand_l', 'hand_r', 'lowerarm_l', 'lowerarm_r', 'head') if b in a.pose.bones})
    for o in [o for o in bpy.data.objects if o.type == 'MESH' and 'Swaddle' in o.name]:
        print('DBG SW', [round(x, 2) for x in o.matrix_world.translation], [round(x,2) for x in o.dimensions])
    bpy.ops.mesh.primitive_cube_add(size=1, location=(4.32, -1.66, .99)); bx = bpy.context.object; bx.scale = (.3, .24, .07)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(4.3, -1.6, .45)); tb = bpy.context.object; tb.scale = (1.6, .55, .9)
    scene = bpy.context.scene; scene.render.engine = 'CYCLES'; scene.cycles.samples = 32; scene.cycles.device = 'GPU'
    prefs = bpy.context.preferences.addons['cycles'].preferences; prefs.compute_device_type = 'OPTIX'; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == 'OPTIX'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 900
    w = bpy.data.worlds.new('w'); scene.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.5; sun.rotation_euler = (.8, .1, -1.2); scene.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
    for nm, pos, look, fov in (('web', (2.55, -1.95, 1.5), (4.3, -1.68, 1.18), 38), ('wide', (1.6, -3.6, 1.7), (4.3, -1.7, 1.0), 45), ('baby', (3.0, -1.6, 1.35), (4.32, -2.1, 1.05), 30)):
        cam.location = pos; d = Vector(look) - Vector(pos); cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler(); cam.data.angle = math.radians(fov) * 1.5
        scene.render.filepath = os.path.join(OUT, f'donate-{nm}.png'); bpy.ops.render.render(write_still=True)
