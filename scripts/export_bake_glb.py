"""Экспорт нецелевой копии GLB без Draco для офлайн-запекания точек."""

from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "models" / "mask-v3.glb"
OUTPUT = ROOT / "scripts" / "renders" / "mask-bake.glb"

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if not meshes:
    raise RuntimeError("GLB не содержит mesh")

obj = meshes[0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

print(f"[bake] mesh: {len(obj.data.vertices):,} verts / {len(obj.data.polygons):,} faces")

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(OUTPUT),
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="NONE",
    export_draco_mesh_compression_enable=False,
)
print(f"[bake] written {OUTPUT} ({OUTPUT.stat().st_size / 1e6:.2f} MB)")
