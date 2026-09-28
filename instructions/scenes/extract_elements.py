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
dataprefix = "posterelements"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder, configname)
promptpath = os.path.join(promptfolder, promptname)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)

ElementItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatElements",
    "champs": {
        "scenes": {
            "type": list[ElementItem],
            "description": "La liste des éléments extraits pour chaque scène du tableau d'entrée"
        }
    }
}
ResultatElements = f.BuildOutputClass(config_principale)

for i in range(1, 5):
    inputpath = os.path.join(resultsfolder, f"scenes_{i}.json")
    with open(inputpath, "r", encoding="utf-8") as fichier:
        scenes = json.load(fichier)
    titres_par_id = {scene["id"]: scene["scene_title"] for scene in scenes}
    scenes_json_str = json.dumps(scenes, ensure_ascii=False)

    response = client.models.generate_content(
        model=modelname,
        contents=[promptobj, scenes_json_str],
        config={
            'response_mime_type': 'application/json',
            'response_schema': ResultatElements,
            'temperature': 0.75
        }
    )
    data = json.loads(response.text)
    for item in data["scenes"]:
        item["scene_title"] = titres_par_id.get(item["id"])

    outputpath = os.path.join(resultsfolder, f"scenes_elements_{i}.json")
    f.SaveJson(data["scenes"], outputpath)
    print(outputpath, len(data["scenes"]))
    time.sleep(1)
