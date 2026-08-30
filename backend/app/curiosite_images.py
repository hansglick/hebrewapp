"""Résolution des images des contenus "curiosités" (tanakh, récit, landmark,
blague) — même situation que celeb.py : le champ `imagepath` des JSON source
ne correspond ni au bon dossier ni au nom exact du fichier (suffixes `_00`/
`_5` variables, extensions `.png`/`.jpg` mélangées), donc résolution par
motif tolérant plutôt que par chemin littéral. `proverb` n'a pas d'image
(texte seul) ; `expression`/`presse` gardent leur résolution existante
(leur `imagepath` est déjà un chemin littéral valide) — ce module ne les
concerne pas."""

import re
from functools import lru_cache

from app.config import RESULTS_DIR

# (dossier sous backend/results/, préfixe de fichier, largeur du zero-padding)
_IMAGE_TYPES = {
    "tanakh": ("images_tanakh", "biblical_image", 3),
    "recit": ("images_recit", "biblical_image", 3),
    "landmark": ("images_landmark", "landmark_image", 3),
    "blague": ("images_blague", "joke_image", 2),
}


@lru_cache(maxsize=None)
def _filenames_for(curiosite_type: str) -> dict:
    """{index: nom_de_fichier} pour un type donné, résolu une fois par glob
    tolérant (peu importe le padding réel ou le suffixe/extension du
    fichier, tant que le préfixe et le numéro d'index correspondent)."""
    folder, prefix, _pad = _IMAGE_TYPES[curiosite_type]
    directory = RESULTS_DIR / folder
    if not directory.is_dir():
        return {}
    pattern = re.compile(rf"^{re.escape(prefix)}_0*(\d+)(_.*)?\.(png|jpg|jpeg)$", re.IGNORECASE)
    filenames: dict[int, str] = {}
    for path in directory.iterdir():
        match = pattern.match(path.name)
        if match:
            filenames.setdefault(int(match.group(1)), path.name)
    return filenames


def image_relative_path(curiosite_type: str, index: int) -> str | None:
    """Chemin relatif à backend/results/ (compatible avec le mount /media et
    mediaUrl), ou None si le type n'a pas d'image (proverb) ou si l'image
    est introuvable pour cet index."""
    if curiosite_type not in _IMAGE_TYPES:
        return None
    folder, _prefix, _pad = _IMAGE_TYPES[curiosite_type]
    filename = _filenames_for(curiosite_type).get(index)
    return f"{folder}/{filename}" if filename else None


def has_image(curiosite_type: str, index: int) -> bool:
    if curiosite_type not in _IMAGE_TYPES:
        return True  # proverb : pas d'image requise
    return index in _filenames_for(curiosite_type)
