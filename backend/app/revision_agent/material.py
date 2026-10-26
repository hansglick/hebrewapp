"""Matière du prof pour l'expression libre : les mots et verbes des leçons révisées (item_word, item_verbe)."""

from app.data_loader import get_dataset
from app.revision_agent.passages import lesson_number


def vocabulary(lesson: str, current: bool, previous: bool) -> list[dict]:
    """{"hebrew", "french"} des mots puis des verbes de la leçon choisie et/ou des leçons antérieures,
    selon les cases cochées (cf. demande explicite du user), dans l'ordre des leçons."""
    selected = lesson_number(lesson)
    if selected is None:
        return []

    def kept(item: dict) -> int | None:
        number = lesson_number(f"{item.get('chapter')}.{item.get('lesson')}")
        if number is not None and ((current and number == selected) or (previous and number < selected)):
            return number
        return None

    entries = []
    for name, french_field in (("word", "french"), ("verbe", "traduction")):
        items = [(n, item) for item in get_dataset(name).values() if (n := kept(item)) is not None]
        for _, item in sorted(items, key=lambda pair: pair[0]):
            # « מָה ? », « אֵיפֹה ? » : le point d'interrogation n'a rien à faire dans un indice.
            hebrew = item["original"].replace("?", "").strip()
            entries.append({"hebrew": hebrew, "french": item[french_field]})
    return entries
