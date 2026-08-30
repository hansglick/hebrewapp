import re

_YOUTUBE_ID_PATTERN = re.compile(
    r"(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^\"&?\/\s]{11})"
)


def extraire_cle_youtube(url: str) -> str | None:
    """Extrait la clé (ID) d'une vidéo YouTube à partir de son URL, ou None
    si l'URL n'est pas reconnaissable comme une adresse YouTube."""
    match = _YOUTUBE_ID_PATTERN.search(url)
    return match.group(1) if match else None
