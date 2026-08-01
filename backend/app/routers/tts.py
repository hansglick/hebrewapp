import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

router = APIRouter(prefix="/api", tags=["tts"])

# Endpoint non officiel de Google Translate (pas de clé API requise).
# Limité en longueur de texte (~200 caractères) côté Google.
GOOGLE_TTS_URL = "https://translate.google.com/translate_tts"


@router.get("/tts")
async def tts(text: str = Query(...), lang: str = Query("he")):
    params = {"ie": "UTF-8", "q": text, "tl": lang, "client": "tw-ob"}
    headers = {"User-Agent": "Mozilla/5.0"}

    async with httpx.AsyncClient() as client:
        response = await client.get(GOOGLE_TTS_URL, params=params, headers=headers)

    if response.status_code != 200:
        raise HTTPException(response.status_code, "Échec de la synthèse vocale")

    return Response(content=response.content, media_type="audio/mpeg")
