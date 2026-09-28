import os
from PIL import Image

srcfolder = "results/illustrations"
destfolder = "../../backend/results/images_scene"
os.makedirs(destfolder, exist_ok=True)

TARGET_WIDTH = 640

for i in range(1, 61):
    srcpath = os.path.join(srcfolder, f"scene_{i}.jpg")
    image = Image.open(srcpath).convert("RGB")
    w, h = image.size
    target_h = round(h * TARGET_WIDTH / w)
    image = image.resize((TARGET_WIDTH, target_h), Image.LANCZOS)
    destpath = os.path.join(destfolder, f"scene_{i}.jpg")
    image.save(destpath, quality=87)
    print(destpath, image.size)
