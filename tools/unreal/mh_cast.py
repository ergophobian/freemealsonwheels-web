# Build the Free Meals on Wheels MetaHuman cast from cast.json: one character per entry, rigged and textured.
import unreal, random, os, json, traceback
LOG = r'C:\fmow\mh\cast.txt'
def log(*a):
    with open(LOG, 'a') as f: f.write(' '.join(str(x) for x in a) + '\n')
open(LOG, 'w').close()
CAST = json.load(open(r'C:\fmow\mhp\cast.json'))
ONLY = os.path.exists(r'C:\fmow\mhp\only.txt') and open(r'C:\fmow\mhp\only.txt').read().split()
ar = unreal.AssetRegistryHelpers.get_asset_registry(); ar.scan_paths_synchronous(['/MetaHumanCharacter'], True)
s = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
tools = unreal.AssetToolsHelpers.get_asset_tools()
G = '/MetaHumanCharacter/Optional/Grooms/Bindings/'
SLOTDIR = {'Hair': 'Hair', 'Eyebrows': 'Eyebrows', 'Eyelashes': 'Eyelashes', 'Beard': 'Beards', 'Mustache': 'Mustaches'}

def params(ch, key):
    return ch.internal_collection.default_instance.get_instance_parameters(item_path=unreal.MetaHumanPaletteItemPath(item_key=key))

def make(p):
    NAME = p['id']; random.seed(p.get('seed', hash(NAME) & 0xffff))
    path = f'/Game/Cast/{NAME}'
    if unreal.EditorAssetLibrary.does_asset_exist(path): unreal.EditorAssetLibrary.delete_asset(path)
    ch = tools.create_asset(NAME, '/Game/Cast', unreal.MetaHumanCharacter, unreal.new_object(type=unreal.MetaHumanCharacterFactoryNew))
    keys = {}
    for slot, item in p['grooms'].items():
        wi = unreal.load_asset(f'{G}{SLOTDIR[slot]}/WI_{item}.WI_{item}')
        if not wi: log('  missing groom', item); continue
        k = ch.internal_collection.try_add_item_from_wardrobe_item(slot, wi)
        ch.internal_collection.default_instance.try_add_slot_selection(unreal.MetaHumanPipelineSlotSelection(slot_name=slot, selected_item=k)); keys[slot] = k
    wi = unreal.load_asset('/MetaHumanCharacter/Optional/Clothing/WI_DefaultGarment.WI_DefaultGarment')
    k = ch.internal_collection.try_add_item_from_wardrobe_item('Outfits', wi)
    ch.internal_collection.default_instance.try_add_slot_selection(unreal.MetaHumanPipelineSlotSelection(slot_name='Outfits', selected_item=k)); keys['Outfits'] = k
    if not s.try_add_object_to_edit(ch): raise RuntimeError('cannot edit')
    try:
        cs = {str(c.name).lower().replace(' ', '_'): c for c in s.get_body_constraints(ch)}
        if p is CAST[0]: log('  constraints', {n: (round(c.target_measurement, 2), round(c.min_measurement, 2), round(c.max_measurement, 2)) for n, c in cs.items()})
        for n, v in p.get('body', {}).items():
            c = cs[n]; c.is_active = True
            # values in 0..1 map onto each constraint's own range; anything bigger is an absolute measurement
            c.target_measurement = c.min_measurement + v * (c.max_measurement - c.min_measurement) if v <= 1.0 else float(v)
        s.set_body_constraints(ch, list(cs.values())); s.commit_body_state(ch)
        lm = s.get_face_landmarks(character=ch)
        pts = [(v.x, v.y, v.z) for v in lm]; d = [[0., 0., 0.] for _ in pts]
        for _ in range(p.get('bumps', 10)):
            cx = random.choice(pts); r = random.uniform(1.5, 4.0); off = [random.gauss(0, p.get('sculpt', .6) * .25) for _ in range(3)]
            for i, q in enumerate(pts):
                w = max(0., 1 - ((q[0]-cx[0])**2 + (q[1]-cx[1])**2 + (q[2]-cx[2])**2) ** .5 / r)
                for j in range(3): d[i][j] += off[j] * w * w
        if p.get('sculpt', .6) > 0:
            s.translate_face_landmarks(character=ch, landmark_indices=list(range(len(pts))), deltas=[unreal.Vector(*x) for x in d]); s.commit_face_state(ch)
        sp = unreal.MetaHumanCharacterSkinProperties(); sp.u, sp.v = p['skin']; sp.roughness = p.get('rough', .85)
        sp.face_texture_index = p.get('face_tex', 0); sp.body_texture_index = p.get('body_tex', p.get('face_tex', 0))
        ss = unreal.MetaHumanCharacterSkinSettings(); ss.skin = sp; s.commit_skin_settings(ch, ss)
        s.assemble_for_preview(character=ch)
        for slot, k in keys.items():
            ps = params(ch, k)
            if p is CAST[0] or slot == 'Outfits' and NAME == CAST[0]['id']: log('  params', slot, [(x.name, str(x.type)) for x in ps])
            for x in ps:
                v = p.get('params', {}).get(slot, {}).get(str(x.name))
                if v is None: continue
                if isinstance(v, list): x.set_color(value=unreal.LinearColor(*v))
                elif isinstance(v, bool): x.set_bool(value=v)
                else: x.set_float(value=float(v))
                log('  set', slot, x.name, v)
        r = unreal.MetaHumanCharacterAutoRiggingRequestParams(); r.blocking = True; r.report_progress = False; r.rig_type = unreal.MetaHumanRigType.JOINTS_ONLY
        s.request_auto_rigging(ch, r)
        r = unreal.MetaHumanCharacterTextureRequestParams(); r.blocking = True; r.report_progress = False; s.request_texture_sources(ch, r)
        log('OK made', NAME, 'textures', ch.has_high_resolution_textures)
    finally:
        if s.is_object_added_for_editing(ch): s.remove_object_to_edit(ch)
        unreal.EditorAssetLibrary.save_loaded_asset(ch)

for p in CAST:
    if ONLY and p['id'] not in ONLY: continue
    try: make(p)
    except Exception as e: log('FAIL', p['id'], repr(e)[:300]); log(traceback.format_exc())
log('END')
unreal.SystemLibrary.quit_editor()
