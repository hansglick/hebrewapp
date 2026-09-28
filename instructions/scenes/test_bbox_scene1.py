import json
import os
from PIL import Image, ImageDraw, ImageFont

resultsfolder = "results/posters"
illustrationsfolder = "results/illustrations"

inputpath = os.path.join(resultsfolder, "scenes_complete.json")
with open(inputpath, "r", encoding="utf-8") as fichier:
    scenes = json.load(fichier)

scene = next(s for s in scenes if s["id"] == 1)

# Boites determinees par observation visuelle directe de scene_1.jpg
# (coordonnees normalisees [xmin, ymin, xmax, ymax], 0-1 relatif a l'image).
items_action_boxes = [
    [0.469, 0.391, 0.879, 0.618],  # peser -> vendeuse + balance
    [0.293, 0.488, 0.508, 0.586],  # payer -> main de la cliente + piece
]
items_elements_boxes = [
    [0.508, 0.514, 0.664, 0.579],  # tomate
    [0.029, 0.703, 0.410, 0.944],  # sac
    [0.410, 0.391, 0.859, 0.690],  # balance
    [0.430, 0.521, 0.508, 0.566],  # piece de monnaie
    [0.605, 0.247, 1.000, 0.651],  # vendeur
    [0.225, 0.495, 0.449, 0.566],  # fruit
]

scene["items_action_boxes"] = items_action_boxes
scene["items_elements_boxes"] = items_elements_boxes

with open(inputpath, "w", encoding="utf-8") as fichier:
    json.dump(scenes, fichier, ensure_ascii=False, indent=2)

print("scenes_complete.json mis a jour pour la scene 1")

# Apercu visuel
imgpath = os.path.join(illustrationsfolder, "scene_1.jpg")
image = Image.open(imgpath).convert("RGB")
W, H = image.size
draw = ImageDraw.Draw(image)

try:
    font = ImageFont.truetype("arial.ttf", 22)
except Exception:
    font = ImageFont.load_default()

def draw_box(box, label, color):
    xmin, ymin, xmax, ymax = box
    rect = (xmin * W, ymin * H, xmax * W, ymax * H)
    draw.rectangle(rect, outline=color, width=4)
    tx, ty = rect[0] + 4, max(0, rect[1] - 26)
    tw = draw.textlength(label, font=font)
    draw.rectangle((tx, ty, tx + tw + 8, ty + 24), fill=color)
    draw.text((tx + 4, ty + 1), label, fill="white", font=font)

for (heb, fr), box in zip(scene["items_action"], items_action_boxes):
    draw_box(box, fr, "red")

for (heb, fr), box in zip(scene["items_elements"], items_elements_boxes):
    draw_box(box, fr, "blue")

outpath = os.path.join(illustrationsfolder, "scene_1_bbox_preview.jpg")
image.save(outpath)
print(outpath, image.size)
