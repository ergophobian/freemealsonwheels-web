import unreal, os
L = open(r'C:\fmow\mh\fbx.txt', 'w')
ar = unreal.AssetRegistryHelpers.get_asset_registry(); ar.scan_paths_synchronous(['/Game/BuiltMEDIUM'], True)
for NAME in open(r'C:\fmow\mhp\names.txt').read().split():
    out = rf'C:\fmow\mh\fbx\{NAME}'; os.makedirs(out, exist_ok=True)
    for a in ar.get_assets_by_path(f'/Game/BuiltMEDIUM/{NAME}', recursive=True):
        if str(a.asset_class_path.asset_name) != 'SkeletalMesh': continue
        m = unreal.load_asset(str(a.package_name))
        t = unreal.AssetExportTask(); t.object = m; t.filename = os.path.join(out, str(a.asset_name) + '.fbx'); t.automated = True; t.prompt = False; t.replace_identical = True
        o = unreal.FbxExportOption(); o.export_morph_targets = False; o.level_of_detail = False; o.collision = False; o.export_local_time = True
        try: o.ascii = False
        except Exception: pass
        t.options = o
        L.write(f'FBX {NAME} {a.asset_name} {unreal.Exporter.run_asset_export_task(t)}\n'); L.flush()
L.write('END\n'); L.close()
unreal.SystemLibrary.quit_editor()
