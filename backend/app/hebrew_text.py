import unicodedata


def strip_nikud(text: str) -> str:
    """Retire les points-voyelles et signes cantillatifs hébraïques (catégorie
    Unicode "Mn", Mark Nonspacing) sans toucher au maqaf ou au guershayim/geresh
    (ponctuation, pas des marques combinantes)."""
    return "".join(ch for ch in unicodedata.normalize("NFC", text) if unicodedata.category(ch) != "Mn")
