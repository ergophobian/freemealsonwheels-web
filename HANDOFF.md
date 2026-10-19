# Handoff

Free Meals on Wheels site rebuild (kitchens in San Jose and San Ramon). The whole site is one immersive 3D kitchen street.

- Repo: `~/Desktop/projects/freemealsonwheels-web`. Astro 5 and three.js 0.170.
- Live: https://ergophobian.github.io/freemealsonwheels-web/. Pushing to `main` deploys through GitHub Pages.
- Last shipped commit: `5270889`.

## Where things stand

Kyle's open complaint (2026-10-19): **the characters' bodies look freakish.** Fix this next. Kyle didn't say what exactly is wrong, so ask for a screenshot, or render the body sheets and judge them.

Earlier complaints, from before `5270889`:
- dead eyes
- claw fingers
- twisted arms
- the baby rendered as a floating head
- duplicate NPCs
- hunched walkers with long arms

What `5270889` fixed:
- **Skeleton fit.** Bodies are now built with `detailed_helpers=True`. Without the joint markers, every skeleton used one default body's joints, which sat about 18 cm off.
- **Retargeting.** Each bone is aimed at its child joint and copied as a world-space delta, with fingers in a relaxed curl (`RTF=0`).
- **Real heights.** The web scales each person through `HEIGHT` in `src/lib/world/people.ts`. The donate statics use `to_height()` in Blender.
- **Work clips.** Chop, stir and pack are IK clips at elbow height, with a knife or ladle prop.
- **Eyes.** The eye material is a cut-out.
- **Variety.** 17 people, and `cast.fresh()` picks whoever is least on screen.
- **Donate scene.** A grandmother with grey hair holding the box palm-up, and a mother holding a swaddled baby on her shoulder.

Known rough spots:
- Faces are not photoreal.
- The baby's swaddle is a smooth egg shape.
- The mother's face looks pale.
- A crew member walking past the stove can pass through the cook stationed there.
- Knife and ladle orientation in the hand was never checked up close.
- People assets total about 18 MB.

Possible causes of "freakish" to check first:
- MakeHuman bodies come out about 1.44 m tall and are scaled up uniformly, so the head and hands may be oversized.
- `weight` and proportion values in the `PEOPLE` specs.
- Garments not fitting the body.
- Mesh decimation in `finish()`, capped at 16000 faces.

## Pipeline

All Blender work runs headless on the Windows box (`ssh pi-windows`) in Blender 5.1 with MPFB.
- Working directory there: `C:\fmow`.
- It holds `UAL1_Standard.glb` (Quaternius Universal Animation Library, CC0), the MakeHuman asset packs in `C:\fmow\mh` and the outputs in `C:\fmow\out`.
- Don't run heavy jobs on the Mac. Stop if the Mac's free disk drops under 40 GB.

The main files:
- `tools/blender/people.py`: the cast.
  - Specs: the `PEOPLE` and `DONATE` lists.
  - Each spec: id, gender, age, weight, height, race, skin, hair, clothes with tints, role, and an optional hair tint. A `~` prefix on the hair tint recolours the pixels, for grey hair.
- `tools/blender/kitchen.py`: the building and street bake.
- `tools/blender/ppack.mjs` and `tools/blender/kpack.mjs`: pack the GLBs for the web as webp textures with meshopt compression.

Helpers in `tools/run/`:
- Run `npm i` there once for the gltf-transform, sharp and puppeteer packages.
- `ENVS="K=V ..." ./ppl.sh people.py <win_out_dir> [only_id] [render]` copies `people.py` to Windows and runs it.
  - Env flags:
    - `CMP`, `FRAMES`, `LENS`, `CAMZ`, `CAMX`: comparison renders.
    - `DPREV=1`: donate preview cameras.
    - `RTF`: retargeted fingers.
    - `BAL`, `BUP`, `BCR`: baby placement.
    - `CURL`, `BONES`, `POSETEST`: debugging.
  - `only_id = people` builds the cast without the donate scene.
- `./cmp.sh <clip> <person> <tag> [frames]` renders a person beside the UAL mannequin and writes a front and side sheet. Clips include Walk, Sit, Chop, Stir and Pack.
- `./kb.sh <mode>` renders the kitchen previews. `./kbake.sh [samples]` bakes the kitchen for the web.
- Pack and publish the cast:
  1. Copy the GLBs back with `scp pi-windows:C:/fmow/<out>/*.glb <local_dir>`.
  2. Run `node ../blender/ppack.mjs <local_dir> ../../public/models/people/mh` from `tools/run`.
- Screenshots (start `npm run dev` first, served on `localhost:4321`):
  - `node shoot.mjs <dir> 1440 900 volunteer donate` for the stations. Set `URL=` to shoot the live site.
  - `node hi.mjs <out.png> <station>` for 2× close-ups.
  - `node mflow.mjs <dir>` for the phone flow.

## Web code

- `src/lib/kitchen-scene.ts`: the scene, camera stations, crowd, crew work poses, props, and the donate hand-off placement.
- `src/lib/world/people.ts`: cast loading, `HEIGHT`, the eye and hair material fixes, `fresh()`.
- `src/lib/world/baked.ts`: unlit baked kitchen materials.
- Pages are in `src/pages/`. The community board credits are in `index.astro`.
- Credits: clothing and hair by punkduck, Mindfront and Elvaerwyn (CC BY). The rest is CC0 or under the MakeHuman asset licence.

## Kyle's rules

- He wants no AI-generated faces. People are built in Blender with MakeHuman.
- No ALL-CAPS text anywhere, including `text-transform: uppercase`. Use sentence case.
- Never `rm`. Use `/usr/bin/trash`. No `git clean` or destructive resets.
- No Co-Authored-By lines in commits.
- Ask before downloading anything new. Already approved: Quaternius, Poly Haven, MakeHuman and MPFB packs.
- Give times in Pacific.

## Still open, outside the cast

- Kyle needs to add the Firebase realtime database rule for `/siteFeedback` (write-only) so feedback notes save. See `src/components/Feedback.astro`.
- The old truck files are unused: `public/models/truck.glb`, `src/lib/truck-scene.ts`, `tools/blender/truck.py`.
