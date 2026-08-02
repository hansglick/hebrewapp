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
mykey = "YOUR_GEMINI_API_KEY"  # clé retirée (2026-08-02) : ne jamais commiter une vraie clé
promptfolder = "prompts"
resultsfolder = "results/evaluations/translations"

modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)

dataprefix = "translation_evaluation"
promptname = "extract_" + dataprefix + ".txt"
configname = "extract_" + dataprefix + ".json"
promptpath = os.path.join(promptfolder,promptname)
configpath = os.path.join(promptfolder,configname)
formatinstructions = f.LoadConfig(configpath)
promptobj = f.LoadPrompt(promptpath)
ClassResponse = f.BuildOutputClass(formatinstructions)

sentence_to_translate = "מתי גדי יוצא מהמשרד לאכול ארוחת צהריים?"
student_solution = "Quand Gadi est il sorti du bureau pour prendre son déjeuner?"
prompt = promptobj.format(sentence_to_translate=sentence_to_translate,
                         student_solution=student_solution)

response = client.models.generate_content(
    model=modelname,
    contents=[prompt],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ClassResponse,
        'temperature': 0.1
    }
)

response_json = json.loads(response.text)