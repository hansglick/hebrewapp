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
import re

youtube_video_url = "https://www.youtube.com/watch?v=pwXHKj1C7hY"

promptfolder = "prompts"
resultsfolder = "results/lyrics"
modelname = "gemini-3.1-pro-preview"
client = genai.Client(api_key=mykey)

dataprefix = "lyrics"
promptname = "extract_" + dataprefix + ".txt"
configname = "extract_" + dataprefix + ".json"
promptpath = os.path.join(promptfolder,promptname)
configpath = os.path.join(promptfolder,configname)

def extraire_cle_youtube(url):
    """
    Extrait la clé (ID) d'une vidéo YouTube à partir de son URL.
    Retourne l'ID sous forme de chaîne de caractères, ou None si introuvable.
    """
    # Ce motif couvre la majorité des formats d'URL YouTube
    pattern = r"(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^\"&?\/\s]{11})"
    
    correspondance = re.search(pattern, url)
    
    if correspondance:
        return correspondance.group(1)
    
    return None

formatinstructions = f.LoadConfig(configpath)
promptobj = f.LoadPrompt(promptpath)
ClassResponse = f.BuildOutputClass(formatinstructions)

response = client.models.generate_content(
    model=modelname,
    contents=[types.Part.from_uri(
            file_uri=youtube_video_url,
            mime_type="video/mp4" 
        ),prompt],
    config={
        'response_mime_type': 'application/json',
        'response_schema': ClassResponse,
        'temperature': 0.1
    }
)

data = json.loads(response.text)
youtubekey = extraire_cle_youtube(youtube_video_url)
url = data["url"]
titre,titre_fr = data["title"]
paroles = []
for idx,(he,fr) in enumerate(data["lyrics"]):
    temp = {"index":idx+1,"hebrew":he,"french":fr}
    paroles.append(temp)
videodata = {"key":youtubekey,"url":url,"title_he":titre,"title_fr":titre_fr,"lyrics":paroles}

