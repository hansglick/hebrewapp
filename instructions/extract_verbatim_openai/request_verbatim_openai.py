mykey = "REDACTED_OPENAI_KEY"

from openai import OpenAI
import time
import fun as f

filepath = "mp3s/reponsef.mp3"
modelname = "gpt-4o-mini-transcribe"
client = OpenAI(api_key=mykey)

audio_file = open(filepath, "rb")
transcript = client.audio.transcriptions.create(
  model="gpt-4o-transcribe",
  file=audio_file,
    language="he"
)

result = transcript.text

