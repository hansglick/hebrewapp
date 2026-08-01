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


mykey = "REDACTED_GEMINI_KEY"
modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)

promptfolder = "prompts"
datafolder = "mp3s"
resultsfolder = "results/evaluations/comprehensions"
dataprefix = "oral_evaluation"
configname = "extract_" + dataprefix + ".json"
promptname = "extract_" + dataprefix + ".txt"
configpath = os.path.join(promptfolder,configname)
promptpath = os.path.join(promptfolder,promptname)
promptobj = f.LoadPrompt(promptpath)
formatinstructions = f.LoadConfig(configpath)
ClassResponse = f.BuildOutputClass(formatinstructions)

filename = "reponsef.mp3"
filepath = os.path.join(datafolder,filename)
question_hebrew = "מתי גדי יוצא מהמשרד לאכול ארוחת צהריים?"
texte_hebrew = "גדי בעבודה. בהפסקה הוא יוצא מהמשרד לאכול ארוחת צוהריים ומתקשר לירון: גדי: שלום ירון, מה שלומך? ירון: טוב תודה, ומה שלומך? גדי: גם טוב תודה, אני רוצה לדעת אם אני יכול לפגוש אותך ביום חמישי בערב לארוחה? ירון: אני מצטער גדי, אני לא יכול לראות אותך, אני רואה את דנה. אני רואה אותה עם דוד ושרה. גדי: בסדר, אני יכול לראות אתכם אחרי הארוחה? ירון: בוודאי! אתה יכול לראות אותנו. אנחנו יכולים לחכות לך ולשתות קפה ועוגה כולם ביחד. גדי: אני שמח מאוד לראות אתכם. ירון: גם אנחנו שמחים מאוד לראות אותך."
prompt = promptobj.format(question_hebrew=question_hebrew,
                         texte_hebrew=texte_hebrew)
outputpath = os.path.join(resultsfolder, "oral_evaluation_" + filename + ".json")

with open(filepath, "rb") as f_audio:
    audio_bytes = f_audio.read()
audio_part = types.Part.from_bytes(
    data=audio_bytes,
    mime_type="audio/mp3" 
)
JointFile = client.files.upload(file=filepath)

response = client.models.generate_content(
    model=modelname,
    contents=[JointFile, prompt],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ClassResponse,
        'temperature': 0.1
    }
)

data = json.loads(response.text)
f.SaveJson(data,outputpath)
client.files.delete(name=JointFile.name)
