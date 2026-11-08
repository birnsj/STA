# Spike3d character models

Replaceable assets for map figures (procedural humans + race mesh kits).

## Uniforms (division tunic albedos)

- `shared/uniform-command.png`
- `shared/uniform-operations.png`
- `shared/uniform-sciences.png`

Colours match `src/data/adaptation/uniforms.json`. `setUniformColour` picks the nearest division texture — no mask shader.

## Race meshes (optional GLB overrides)

Until a file exists, the game builds a procedural kit in `src/spike3d/raceMeshes/`.

Drop a GLB at:

```
{species}-{gender}.glb
```

Examples: `vulcan-male.glb`, `andorian-female.glb`, `caitian-male.glb`, `klingon-female.glb`.

Requirements:

- Root (or a child named `race_mesh`) is attached under the humanoid `headRoot` joint.
- Shared animation stays on the procedural skeleton (`HumanoidAnimator`); the GLB is visual mesh only.
- Humans have no GLB — they use `HumanoidModel` as-is.
- `mixedHeritage` / `newSpecies` use the human mesh.

Bake uniforms: `node tools/bakeSpike3dRaceMeshes.mjs [--force]`
