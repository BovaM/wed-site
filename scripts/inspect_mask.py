from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "scripts" / "renders"
OUT.mkdir(parents=True, exist_ok=True)


def look_at(camera, target):
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT / "public" / "models" / "mask.glb"))
meshes = [o for o in bpy.context.selected_objects if o.type == "MESH"]
obj = meshes[0]
print("DIM", tuple(round(v, 3) for v in obj.dimensions))
print("LOC", tuple(round(v, 3) for v in obj.location))

scene = bpy.context.scene
scene.render.engine = "BLENDER_WORKBENCH"
scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"

shading = scene.display.shading
shading.light = "STUDIO"
shading.studio_light = "paint.sl"
shading.color_type = "SINGLE"
shading.single_color = (0.93, 0.91, 0.88)
shading.show_shadows = True
shading.shadow_intensity = 0.3
shading.show_cavity = True
shading.cavity_type = "BOTH"
shading.curvature_ridge_factor = 1.8
shading.curvature_valley_factor = 1.3
scene.display.render_aa = "8"

world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs[0].default_value = (0.9, 0.89, 0.87, 1.0)

cam_data = bpy.data.cameras.new("InspectCamera")
cam = bpy.data.objects.new("InspectCamera", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
cam_data.type = "ORTHO"
cam_data.ortho_scale = 2.15

views = {
    "insp-neg-y": (0, -8, 0),
    "insp-pos-y": (0, 8, 0),
    "insp-neg-x": (-8, 0, 0),
    "insp-pos-x": (8, 0, 0),
    "insp-pos-z": (0, 0, 8),
    "insp-three-neg-y": (4.5, -4.5, 2.2),
    "insp-three-pos-y": (4.5, 4.5, 2.2),
}
for name, loc in views.items():
    cam.location = Vector(loc)
    look_at(cam, Vector((0, 0, 0)))
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)

# backface-culled variants
shading.show_backface_culling = True
for name, loc in (("bf-neg-y", (0, -8, 0)), ("bf-pos-y", (0, 8, 0))):
    cam.location = Vector(loc)
    look_at(cam, Vector((0, 0, 0)))
    scene.render.filepath = str(OUT / f"{name}.png")
    bpy.ops.render.render(write_still=True)

print("done")
