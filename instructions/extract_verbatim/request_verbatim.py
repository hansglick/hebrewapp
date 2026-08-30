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
datafolder = "mp3s"
filename = "reponsef.mp3"
filepath = os.path.join(datafolder,filename)

resultsfolder = "results/verbatim"
promptfolder = "prompts"
dataprefix = "verbatim"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder,configname)
promptpath = os.path.join(promptfolder,promptname)
promptobj = f.LoadPrompt(promptpath)
formatinstructions = f.LoadConfig(configpath)
ClassResponse = f.BuildOutputClass(formatinstructions)

with open(filepath, "rb") as f_audio:
    audio_bytes = f_audio.read()
    
audio_part = types.Part.from_bytes(
    data=audio_bytes,
    mime_type="audio/mp3" 
)

client = genai.Client(api_key=mykey)
response = client.models.generate_content(
    model=modelname,
    contents=[audio_part, promptobj],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ClassResponse,
        'temperature': 0.1
    }
)

data = json.loads(response.text)