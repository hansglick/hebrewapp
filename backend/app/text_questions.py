def questions_for_text(texts_data: dict, text_code: str) -> list:
    text = texts_data.get(text_code)
    if not text:
        return []
    return [
        (text_code, i)
        for i, q in enumerate(text.get("questions", []))
        if q.get("hebrew")
    ]
