import json
from google import genai
from pydantic import BaseModel, Field
import fun as f
import os
from pathlib import Path
import os
import json
from google.genai import types
import time

mykey = os.environ["GEMINI_API_KEY"]
modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)

promptfolder = "prompts"
resultsfolder = "results/evaluations/grouped_reports"
dataprefix = "grouped_reports"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder,configname)
promptpath = os.path.join(promptfolder,promptname)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)
copiepath = os.path.join(resultsfolder,"reports_example.json")
jsonbatch = f.LoadConfig(copiepath)
jsonbatch_str = json.dumps(jsonbatch, ensure_ascii=False)

ExpressionItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatExpressions",
    "champs": {
        "expressions": {
            "type": list[ExpressionItem], 
            "description": "La liste des résumés de l'étudiant"
        }
    }
}
ResultatExpressions = f.BuildOutputClass(config_principale)

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
