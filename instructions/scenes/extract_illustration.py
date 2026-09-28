import io
import json
from google import genai
from google.genai import types
from PIL import Image
import fun as f
import os
import time

# Dimension exacte imposée (2:3, portrait) — le modèle ne garantit qu'un
# ratio via aspect_ratio/image_size (ex: 848x1264 pour "1K"), jamais cette
# taille précise : on redimensionne nous-mêmes après génération, sans
# recadrage puisque le ratio 1024/1536 = 2/3 correspond déjà exactement —
# cf. demande explicite du user.
TARGET_SIZE = (1024, 1536)

modelname = "gemini-3.1-flash-image"
mykey = os.environ["GEMINI_API_KEY"]
client = genai.Client(api_key=mykey)

resultsfolder = "results/posters"
illustrationsfolder = "results/illustrations"
os.makedirs(illustrationsfolder, exist_ok=True)

inputpath = os.path.join(resultsfolder, "scenes_complete.json")
with open(inputpath, "r", encoding="utf-8") as fichier:
    scenes = json.load(fichier)

# Renforce le contraste de valeur entre les éléments, sans dénaturer la
# palette pastel — validé par le user sur la scène 1, désormais appliqué
# à toutes les scènes.
contrast_clause = (
    " With bold, well-defined dark outlines separating each object from "
    "its background and neighboring elements, and clear tonal contrast "
    "between foreground subjects and background so every part of the "
    "scene remains easily distinguishable."
)

for scene in scenes:
    prompt = scene["prompt"] + contrast_clause

    response = client.models.generate_content(
        model=modelname,
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio="2:3"),
        ),
    )

    parts = response.candidates[0].content.parts
    for part in parts:
        if part.inline_data is not None:
            ext = "png" if "png" in part.inline_data.mime_type else "jpg"
            outpath = os.path.join(illustrationsfolder, f"scene_{scene['id']}.{ext}")
            image = Image.open(io.BytesIO(part.inline_data.data))
            image = image.resize(TARGET_SIZE, Image.LANCZOS)
            image.save(outpath)
            print(outpath, image.size)
    time.sleep(1)
