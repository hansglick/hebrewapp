"""Fiches des 230 cartes "célébrités" (item_celeb.json + images
backend/results/images_celeb/). Ne connaît rien du wallet — juste la
résolution des données/images par index de carte."""

from functools import lru_cache

from app.config import RESULTS_DIR
from app.data_loader import get_dataset

IMAGES_DIR = RESULTS_DIR / "images_celeb_resized"

# Les fichiers sources (backend/results/images_celeb/, ~1024x1536, jusqu'à
# plusieurs Mo chacun) ne sont jamais servis tels quels : ils sont
# rééchantillonnés une bonne fois en Lanczos vers ~560px de large (JPEG q87)
# dans images_celeb_resized/ — c'est ce qui donne des cartes bien lissées à
# l'affichage (comme dans le prototype "Cabinet des Cartes") plutôt qu'un
# downscale brut par le navigateur, et divise le poids transféré par ~7.


@lru_cache(maxsize=1)
def _image_filenames() -> dict:
    """{index: nom_de_fichier} — toujours .jpg côté rééchantillonné, même
    quand la source d'origine était un .png."""
    filenames = {}
    if IMAGES_DIR.is_dir():
        for path in IMAGES_DIR.glob("celeb_*_index_0.*"):
            digits = path.name.split("_")[1]
            filenames[int(digits)] = path.name
    return filenames


def image_relative_path(index: int) -> str | None:
    """Chemin relatif à backend/results/ (compatible avec le mount /media
    et le helper frontend mediaUrl), ou None si l'image est absente."""
    filename = _image_filenames().get(index)
    return f"images_celeb_resized/{filename}" if filename else None


def get_info(index: int) -> dict | None:
    """{name_hebreu, name_latin, apports} pour une carte, ou None si
    l'index est inconnu du catalogue."""
    row = get_dataset("celeb").get(str(index))
    if row is None:
        return None
    return {
        "name_hebreu": row["name_hebreu"],
        "name_latin": row["name_latin"],
        "apports": row["apports"],
    }
