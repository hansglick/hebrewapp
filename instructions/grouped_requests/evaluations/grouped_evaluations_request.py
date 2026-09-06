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
resultsfolder = "results/evaluations/grouped_evaluations"
prefix = "grouped_evaluations"
modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)
copiepath = os.path.join(resultsfolder,"evaluations_example.json")

dataprefix = "grouped_evaluations"
promptname = "extract_" + dataprefix + ".txt"
configname = "extract_" + dataprefix + ".json"
promptpath = os.path.join(promptfolder,promptname)
configpath = os.path.join(promptfolder,configname)
formatinstructions = f.LoadConfig(configpath)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)

ExpressionItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatExpressions",
    "champs": {
        "expressions": {
            "type": list[ExpressionItem], 
            "description": "La liste des réponses de l'étudiant"
        }
    }
}
ResultatExpressions = f.BuildOutputClass(config_principale)

jsonbatch = f.LoadConfig(copiepath)
jsonbatch_str = json.dumps(jsonbatch, ensure_ascii=False)

response = client.models.generate_content(
    model=modelname,
    contents=[promptobj,jsonbatch_str],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ResultatExpressions,
        'temperature': 0.1
    }
)

data = json.loads(response.text)
outputpath = os.path.join(resultsfolder,"response.json")
f.SaveJson(data,outputpath)