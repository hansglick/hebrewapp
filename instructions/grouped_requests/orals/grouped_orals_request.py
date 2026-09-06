import json
from google import genai
from pydantic import BaseModel, Field
import fun as f
import os
import base64
from pathlib import Path
import glob

mykey = os.environ["GEMINI_API_KEY"]
promptfolder = "prompts"
resultsfolder = "results/evaluations/grouped_oral"
prefix = "grouped_oral"
modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)
copiepath = os.path.join(resultsfolder,"orals_example.json")

dataprefix = "grouped_oral"
promptname = "extract_" + dataprefix + ".txt"
configname = "extract_" + dataprefix + ".json"
promptpath = os.path.join(promptfolder,promptname)
configpath = os.path.join(promptfolder,configname)
formatinstructions = f.LoadConfig(configpath)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)

jsonbatch = f.LoadConfig(copiepath)
jsonbatch_str = json.dumps(jsonbatch, ensure_ascii=False)
prompt_contents = [
    promptobj,
    "\nVoici le JSON :\n",
    jsonbatch_str,
    "\nVoici les fichiers vocaux :\n"
]

dossier_vocaux = Path(resultsfolder)
for chemin_fichier in dossier_vocaux.glob("response_*.m4*"):
    print(f"Upload de {chemin_fichier.name}...")
    uploaded_file = client.files.upload(file=str(chemin_fichier))
    # C'EST ICI LA CLÉ : On donne le nom au modèle sous forme de texte, 
    # puis on lui passe l'audio correspondant juste après.
    # Ainsi, votre prompt fonctionnera à la perfection.
    prompt_contents.append(f"Nom du fichier : {chemin_fichier.name}")
    prompt_contents.append(uploaded_file)


ExpressionItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatExpressions",
    "champs": {
        "expressions": {
            "type": list[ExpressionItem], 
            "description": "La liste des exercices de traduction"
        }
    }
}
ResultatExpressions = f.BuildOutputClass(config_principale)

response = client.models.generate_content(
    model=modelname,
    contents=prompt_contents,
    config={
        'response_mime_type': 'application/json',
        'response_schema': ResultatExpressions,
        'temperature': 0.1
    }
)

data = json.loads(response.text)
outputpath = os.path.join(resultsfolder,"response.json")
f.SaveJson(data,outputpath)

