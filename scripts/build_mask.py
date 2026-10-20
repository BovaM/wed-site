"""Собрать свадебную маску: OBJ -> очистка -> decimate -> GLB (Draco).

Запуск:
    blender --background --factory-startup --python scripts/build_mask.py

Результат:
    public/models/mask.glb
    scripts/renders/mask-{front,back,side,three-quarter}.png
    scripts/renders/stats.json
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path

import bpy
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "source" / "pigeon_mask_v2.obj"
OUT_GLB = ROOT / "public" / "models" / "mask.glb"
RENDERS = ROOT / "scripts" / "renders"

TARGET_TRIS = 300_000
WELD_DISTANCE = 1e-4
TARGET_HEIGHT = 1.0


def log(message: str) -> None:
    print(f"[mask] {message}", flush=True)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if not collection.objects and collection.name != "Collection":
            bpy.data.collections.remove(collection)


def import_mesh() -> bpy.types.Object:
    if not SOURCE.exists():
        raise FileNotFoundError(f"Нет исходника: {SOURCE}")
    log(f"import {SOURCE} ({SOURCE.stat().st_size / 1e6:.1f} MB)")
    bpy.ops.wm.obj_import(
        filepath=str(SOURCE),
        forward_axis="NEGATIVE_Z",
        up_axis="Y",
        use_split_objects=False,
        use_split_groups=False,
    )
    meshes = [obj for obj in bpy.context.selected_objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError("OBJ не содержит mesh-объектов")
    if len(meshes) > 1:
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes = [bpy.context.view_layer.objects.active]
    obj = meshes[0]
    obj.name = "PigeonMask"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    log(
        f"imported: {len(obj.data.vertices):,} verts / {len(obj.data.polygons):,} faces"
    )
    return obj


def weld_and_recalc(obj: bpy.types.Object) -> None:
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    before = len(bm.verts)
    log("weld/remove doubles ...")
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=WELD_DISTANCE)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    log(f"welded: {before:,} -> {len(mesh.vertices):,} verts")


def decimate(obj: bpy.types.Object) -> None:
    faces = len(obj.data.polygons)
    ratio = min(1.0, TARGET_TRIS / max(faces, 1))
    log(f"decimate ratio={ratio:.5f} ({faces:,} faces -> ~{TARGET_TRIS:,})")
    modifier = obj.modifiers.new(name="WeddingDecimate", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    log(
        f"decimated: {len(obj.data.vertices):,} verts / {len(obj.data.polygons):,} faces"
    )


def smooth_normals(obj: bpy.types.Object) -> None:
    mesh = obj.data
    mesh.polygons.foreach_set("use_smooth", [True] * len(mesh.polygons))
    mesh.update()
    # Blender 4.1+ keeps custom split normals only when explicitly requested.
    if hasattr(mesh, "set_sharp_from_angle"):
        mesh.set_sharp_from_angle(angle=math.radians(55.0))
    log("smooth shading applied")


def center_and_scale(obj: bpy.types.Object) -> tuple[Vector, float, Vector]:
    mesh = obj.data
    coords = [v.co for v in mesh.vertices]
    low = Vector(
        (
            min(v.x for v in coords),
            min(v.y for v in coords),
            min(v.z for v in coords),
        )
    )
    high = Vector(
        (
            max(v.x for v in coords),
            max(v.y for v in coords),
            max(v.z for v in coords),
        )
    )
    center = (low + high) * 0.5
    size = high - low
    scale = TARGET_HEIGHT / size.z if size.z else 1.0

    mesh.transform(Matrix.Translation(-center))
    mesh.transform(Matrix.Diagonal((scale, scale, scale, 1.0)))
    mesh.update()
    obj.location = (0.0, 0.0, 0.0)
    obj.rotation_euler = (0.0, 0.0, 0.0)
    obj.scale = (1.0, 1.0, 1.0)
    log(
        "normalized: size "
        f"{size.x * scale:.4f} x {size.y * scale:.4f} x {size.z * scale:.4f}"
    )
    return center, scale, size * scale


def create_material(obj: bpy.types.Object) -> None:
    material = bpy.data.materials.new("Porcelain")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.957, 0.945, 0.925, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.3
        bsdf.inputs["Metallic"].default_value = 0.0
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.6
        if "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.18
    obj.data.materials.clear()
    obj.data.materials.append(material)


def export_glb(obj: bpy.types.Object) -> None:
    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    log("export GLB + Draco ...")
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_color_quantization=10,
        export_draco_generic_quantization=12,
    )
    log(f"GLB: {OUT_GLB.stat().st_size / 1e6:.2f} MB")


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_views(obj: bpy.types.Object) -> list[str]:
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"

    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.studio_light = "paint.sl"
    shading.color_type = "SINGLE"
    shading.single_color = (0.94, 0.93, 0.91)
    shading.show_shadows = True
    shading.shadow_intensity = 0.35
    shading.show_cavity = True
    shading.cavity_type = "BOTH"
    shading.curvature_ridge_factor = 1.6
    shading.curvature_valley_factor = 1.2
    scene.display.render_aa = "8"

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.93, 0.92, 0.90, 1.0)
        bg.inputs[1].default_value = 1.0

    camera_data = bpy.data.cameras.new("MaskCamera")
    camera = bpy.data.objects.new("MaskCamera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.28

    views = {
        "front": (0.0, -6.0, 0.0),
        "back": (0.0, 6.0, 0.0),
        "side": (6.0, 0.0, 0.0),
        "three-quarter": (4.2, -4.2, 2.0),
    }
    paths: list[str] = []
    for name, position in views.items():
        camera.location = Vector(position)
        look_at(camera, Vector((0.0, 0.0, 0.0)))
        path = RENDERS / f"mask-{name}.png"
        scene.render.filepath = str(path)
        log(f"render {name} ...")
        bpy.ops.render.render(write_still=True)
        paths.append(str(path))
    return paths


def main() -> None:
    started = time.time()
    clear_scene()
    obj = import_mesh()
    source_stats = {
        "vertices": len(obj.data.vertices),
        "faces": len(obj.data.polygons),
    }
    weld_and_recalc(obj)
    decimate(obj)
    smooth_normals(obj)
    center, scale, normalized_size = center_and_scale(obj)
    create_material(obj)
    export_glb(obj)
    renders = render_views(obj)

    stats = {
        "source": str(SOURCE),
        "sourceStats": source_stats,
        "resultStats": {
            "vertices": len(obj.data.vertices),
            "faces": len(obj.data.polygons),
            "triangles": sum(len(p.vertices) - 2 for p in obj.data.polygons),
        },
        "weldDistance": WELD_DISTANCE,
        "scaleFactor": scale,
        "normalizedSize": [round(v, 5) for v in normalized_size],
        "renderSize": [round(v, 5) for v in normalized_size],
        "glbBytes": OUT_GLB.stat().st_size,
        "renders": renders,
        "seconds": round(time.time() - started, 1),
    }
    (RENDERS / "stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"done in {stats['seconds']}s -> {OUT_GLB}")


if __name__ == "__main__":
    main()
