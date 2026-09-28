import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

resultsfolder = "results/posters"
illustrationsfolder = "results/illustrations"

inputpath = os.path.join(resultsfolder, "scenes_complete.json")
with open(inputpath, "r", encoding="utf-8") as fichier:
    scenes = json.load(fichier)
scenes_par_id = {s["id"]: s for s in scenes}

try:
    font = ImageFont.truetype("arial.ttf", 22)
except Exception:
    font = ImageFont.load_default()

def draw_box(draw, box, label, color, W, H):
    xmin, ymin, xmax, ymax = box
    rect = (xmin * W, ymin * H, xmax * W, ymax * H)
    draw.rectangle(rect, outline=color, width=4)
    tx, ty = rect[0] + 4, max(0, rect[1] - 26)
    tw = draw.textlength(label, font=font)
    draw.rectangle((tx, ty, tx + tw + 8, ty + 24), fill=color)
    draw.text((tx + 4, ty + 1), label, fill="white", font=font)

ids = [int(a) for a in sys.argv[1:]]
for scene_id in ids:
    scene = scenes_par_id[scene_id]
    imgpath = os.path.join(illustrationsfolder, f"scene_{scene_id}.jpg")
    image = Image.open(imgpath).convert("RGB")
    W, H = image.size
    draw = ImageDraw.Draw(image)
    for (heb, fr), box in zip(scene["items_action"], scene["items_action_boxes"]):
        draw_box(draw, box, fr, "red", W, H)
    for (heb, fr), box in zip(scene["items_elements"], scene["items_elements_boxes"]):
        draw_box(draw, box, fr, "blue", W, H)
    outpath = os.path.join(illustrationsfolder, f"scene_{scene_id}_bbox_preview.jpg")
    image.save(outpath)
    print(outpath)
