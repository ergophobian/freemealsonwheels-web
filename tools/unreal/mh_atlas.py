import unreal, os
OUT = r'C:\fmow\mh\cardtex'; os.makedirs(OUT, exist_ok=True)
L = open(r'C:\fmow\mh\atlas.txt', 'w')
B = '/MetaHumanCharacter/Optional/Grooms/GroomAssets/'
for p in open(r'C:\fmow\mhp\grooms.txt').read().split():
    for kind in ['CardsAtlas_Attribute', 'CardsAtlas_Tangent']:
        name = p.split('/')[-1] + '_' + kind
        t = unreal.load_asset(f'{B}{p}/{name}.{name}')
        if not t: L.write(f'MISSING {name}\n'); continue
        task = unreal.AssetExportTask(); task.object = t; task.filename = os.path.join(OUT, name + '.tga'); task.automated = True; task.prompt = False; task.replace_identical = True
        L.write(f'TEX {name} {unreal.Exporter.run_asset_export_task(task)} {t.blueprint_get_size_x()}\n')
L.write('END\n'); L.close()
unreal.SystemLibrary.quit_editor()
