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
client = genai.Client(api_key=mykey)

promptfolder = "prompts"
resultsfolder = "results/evaluations/reports"
dataprefix = "rapport"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder,configname)
promptpath = os.path.join(promptfolder,promptname)
promptobj = f.LoadPrompt(promptpath)
formatinstructions = f.LoadConfig(configpath)
ClassResponse = f.BuildOutputClass(formatinstructions)

filename = "rapport_example.txt"
filepath = os.path.join(resultsfolder,filename)
rapport = f.LoadPrompt(filepath)
filename = "texte_example.txt"
filepath = os.path.join(resultsfolder,filename)
texte = f.LoadPrompt(filepath)

prompt = promptobj.format(rapport=rapport,
                         texte=texte)
outputpath = os.path.join(resultsfolder, "report_evaluation_" + ".json")

response = client.models.generate_content(
    model=modelname,
    contents=[prompt],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ClassResponse,
        'temperature': 0.1
    }
)

data = json.loads(response.text)
f.SaveJson(data,outputpath)