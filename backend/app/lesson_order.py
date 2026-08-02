from app.data_loader import get_dataset


def all_lesson_codes_in_order() -> list:
    chapitres = get_dataset("chapitre")
    codes = []
    for chap_id in sorted(chapitres.keys(), key=int):
        codes.extend(chapitres[chap_id]["lessons"])
    return codes
