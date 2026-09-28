import json
import os

srcpath = "results/posters/scenes_complete.json"
with open(srcpath, "r", encoding="utf-8") as fichier:
    scenes = json.load(fichier)

output = {}
for scene in scenes:
    hotspots = []
    for (heb, fr), box in zip(scene["items_action"], scene["items_action_boxes"]):
        hotspots.append({"hebrew": heb, "french": fr, "box": box})
    for (heb, fr), box in zip(scene["items_elements"], scene["items_elements_boxes"]):
        hotspots.append({"hebrew": heb, "french": fr, "box": box})
    output[str(scene["id"])] = {"scene_title": scene["scene_title"], "hotspots": hotspots}

destpath = "../../backend/data/item_scene.json"
with open(destpath, "w", encoding="utf-8") as fichier:
    json.dump(output, fichier, ensure_ascii=False, indent=2)

print(destpath, len(output), "scenes")
