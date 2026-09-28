import json
from google import genai
from pydantic import BaseModel, Field
import fun as f
import os
from pathlib import Path
from google.genai import types
import time

modelname = "gemini-3.1-pro-preview"
mykey = os.environ["GEMINI_API_KEY"]
client = genai.Client(api_key=mykey)

promptfolder = "prompts"
resultsfolder = "results/posters"
dataprefix = "posterprompt"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder, configname)
promptpath = os.path.join(promptfolder, promptname)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)

PromptItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatPrompts",
    "champs": {
        "scenes": {
            "type": list[PromptItem],
            "description": "La liste des prompts visuels générés pour chaque scène du tableau d'entrée"
        }
    }
}
ResultatPrompts = f.BuildOutputClass(config_principale)

toutes_les_scenes = []

for i in range(1, 5):
    inputpath = os.path.join(resultsfolder, f"scenes_elements_{i}.json")
    with open(inputpath, "r", encoding="utf-8") as fichier:
        scenes = json.load(fichier)
    scenes_par_id = {scene["id"]: scene for scene in scenes}
    scenes_json_str = json.dumps(scenes, ensure_ascii=False)

    response = client.models.generate_content(
        model=modelname,
        contents=[promptobj, scenes_json_str],
        config={
            'response_mime_type': 'application/json',
            'response_schema': ResultatPrompts,
            'temperature': 0.75
        }
    )
    data = json.loads(response.text)
    for item in data["scenes"]:
        scenes_par_id[item["id"]]["prompt"] = item["prompt"]

    outputpath = os.path.join(resultsfolder, f"scenes_prompts_{i}.json")
    f.SaveJson(scenes, outputpath)
    print(outputpath, len(scenes))
    toutes_les_scenes.extend(scenes)
    time.sleep(1)

toutes_les_scenes.sort(key=lambda scene: scene["id"])
finalpath = os.path.join(resultsfolder, "scenes_complete.json")
f.SaveJson(toutes_les_scenes, finalpath)
print(finalpath, len(toutes_les_scenes))
