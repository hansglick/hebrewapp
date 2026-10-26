"""Correction d'une réponse de l'élève par le prof (expression libre, déclinaison) : sa phrase telle que le prof
l'a comprise, fautes comprises, ses mots fautifs et le verdict — rien ne s'affiche pendant que l'élève parle.

Message backend → navigateur :
  {"type": "answer", "answer": {"sentence": str, "errors": [str], "success": bool} | null}
"""

CORRECTION_TOOL = {
    "name": "corriger",
    "description": "Affiche à l'écran de l'élève sa phrase telle que tu l'as comprise, ses mots fautifs et ton verdict.",
    "parameters": {
        "type": "OBJECT",
        "properties": {
            "phrase_eleve": {
                "type": "STRING",
                "description": "La phrase de l'élève en écriture hébraïque, exactement telle que tu l'as entendue, fautes comprises, "
                               "sans la corriger (vide s'il n'a rien répondu)",
            },
            "mots_fautifs": {
                "type": "ARRAY", "items": {"type": "STRING"},
                "description": "Les mots de phrase_eleve qui contiennent une erreur de grammaire, recopiés tels qu'ils y sont écrits",
            },
            "reussi": {"type": "BOOLEAN", "description": "Ton verdict : vrai si la réponse est réussie"},
        },
        "required": ["phrase_eleve", "mots_fautifs", "reussi"],
    },
    "behavior": "NON_BLOCKING",
}


def answer_message(args: dict) -> dict:
    return {"type": "answer", "answer": {
        "sentence": str(args.get("phrase_eleve") or "").strip(),
        "errors": [str(w) for w in args.get("mots_fautifs") or []],
        "success": bool(args.get("reussi")),
    }}


CLEAR_ANSWER = {"type": "answer", "answer": None}
