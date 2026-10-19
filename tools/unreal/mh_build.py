import unreal, os, traceback
LOG = r'C:\fmow\mh\build.txt'
def log(*a):
    with open(LOG, 'a') as f: f.write(' '.join(str(x) for x in a) + '\n')
open(LOG, 'w').close()
NAMES = [n for n in open(r'C:\fmow\mhp\names.txt').read().split() if n]
CFG = dict(l.split('=', 1) for l in open(r'C:\fmow\mhp\cfg.txt').read().split() if '=' in l) if os.path.exists(r'C:\fmow\mhp\cfg.txt') else {}
Q = CFG.get('Q', 'MEDIUM'); ROOT = '/Game/Built' + Q; LOD = int(CFG.get('LOD', '0')); HLOD = int(CFG.get('HLOD', '1'))
s = unreal.get_editor_subsystem(unreal.MetaHumanCharacterEditorSubsystem)
ar = unreal.AssetRegistryHelpers.get_asset_registry()
EAL = unreal.EditorAssetLibrary

def build(NAME):
    if EAL.does_directory_exist(f'{ROOT}/{NAME}') and EAL.list_assets(f'{ROOT}/{NAME}'):
        log('skip build', NAME); return
    ch = unreal.load_asset(f'/Game/Cast/{NAME}.{NAME}')
    if not s.try_add_object_to_edit(ch): raise RuntimeError('cannot edit ' + NAME)
    try:
        bp = unreal.MetaHumanCharacterEditorBuildParameters()
        bp.pipeline_type = unreal.MetaHumanDefaultPipelineType.OPTIMIZED
        bp.pipeline_quality = getattr(unreal.MetaHumanQualityLevel, Q)
        bp.absolute_build_path = f'{ROOT}/{NAME}'; bp.common_folder_path = f'{ROOT}/Common'
        bp.enable_wardrobe_item_validation = False
        try: s.build_meta_human(character=ch, params=bp); log('OK build', NAME)
        except Exception as e: log('WARN build', NAME, str(e)[:160])  # control-rig copy noise; meshes still build
    finally:
        if s.is_object_added_for_editing(ch): s.remove_object_to_edit(ch)
    try: EAL.save_directory(ROOT, only_if_is_dirty=True, recursive=True)
    except Exception as e: log('WARN save', str(e)[:160])

def export(NAME):
    ar.scan_paths_synchronous([f'{ROOT}/{NAME}'], True)
    assets = ar.get_assets_by_path(f'{ROOT}/{NAME}', recursive=True)
    for a in assets: log('ASSET', a.asset_class_path.asset_name, a.package_name)
    bps = [a for a in assets if str(a.asset_class_path.asset_name) == 'Blueprint']
    if not bps: raise RuntimeError('no blueprint for ' + NAME)
    cls = EAL.load_blueprint_class(str(bps[0].package_name))
    actor = unreal.EditorLevelLibrary.spawn_actor_from_class(cls, unreal.Vector(0, 0, 0))
    try:
        for c in actor.get_components_by_class(unreal.ActorComponent): log('ANY', c.get_class().get_name(), c.get_name())
        opt = unreal.GLTFExportOptions()
        log('OPTS', [m for m in dir(opt) if not m.startswith('_')])
        for k, v in [('bake_material_inputs', 'SIMPLE'), ('export_vertex_skin_weights', True), ('export_animation_sequences', False), ('default_level_of_detail', LOD)]:
            try:
                if isinstance(v, str): v = getattr(unreal.GLTFMaterialBakeMode, v)
                opt.set_editor_property(k, v)
            except Exception as e: log('opt', k, e)
        r = unreal.GLTFExporter.export_to_gltf(actor.get_world(), rf'C:\fmow\mh\glb\{NAME}.glb', opt, {actor})
        log('OK gltf', NAME, r)
        cards = sorted(str(a.package_name) for a in assets if str(a.asset_class_path.asset_name) == 'StaticMesh' and 'CardsMesh' in str(a.package_name))
        log('CARDS', cards)
        for cp in cards:
            if cp.endswith(f'_LOD{HLOD}'):
                sm = unreal.load_asset(cp); grp = cp.split('/')[-1]
                r = unreal.GLTFExporter.export_to_gltf(sm, rf'C:\fmow\mh\glb\{NAME}__{grp}.glb', opt, set())
                log('OK cards', grp, r)
    finally:
        actor.destroy_actor()

for NAME in NAMES:
    for fn in (build, export):
        try: fn(NAME)
        except Exception as e: log('FAIL', fn.__name__, NAME, repr(e)[:300]); log(traceback.format_exc())
log('END')

unreal.SystemLibrary.quit_editor()  # free the Windows box's RAM as soon as the batch is done
