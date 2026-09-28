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

modelname = "gemini-3.1-pro-preview"
mykey = os.environ["GEMINI_API_KEY"]
client = genai.Client(api_key=mykey)

promptfolder = "prompts"
resultsfolder = "results/posters"
dataprefix = "poster"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder,configname)
promptpath = os.path.join(promptfolder,promptname)
promptobj = f.LoadPrompt(promptpath)
config = f.LoadConfig(configpath)

ExpressionItem = f.BuildOutputClass(config)
config_principale = {
    "nom_modele": "ResultatExpressions",
    "champs": {
        "expressions": {
            "type": list[ExpressionItem], 
            "description": "La liste des scènes"
        }
    }
}
ResultatExpressions = f.BuildOutputClass(config_principale)

response = client.models.generate_content(
    model=modelname,
    contents=[promptobj],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ResultatExpressions,
        'temperature': 0.75
    }
)
data = json.loads(response.text)
outputpath = os.path.join(resultsfolder,"scenes.json")
f.SaveJson(data,outputpath)