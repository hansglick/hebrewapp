from pydantic import Field, create_model

import json



def BuildOutputClass(config_json):

	"""
	crée une class de sortie pour le LLM. Exemple :

	config_json = {
    "nom_modele": "ResultatExtraction",
    "champs": {
        "texte_present": {
            "type": bool,
            "description": "Vaut True si le texte long du début a été trouvé, sinon False"
        },
        "texte_sans_nikud": {
            "type": str,
            "description": "Le texte extrait sans aucun nikud (laisser vide si non trouvé)"
        }
    }
    }
	"""

	# Préparation des arguments pour create_model
	champs_dynamiques = {}

	for nom_champ, infos in config_json["champs"].items():
	    # On extrait le type et la description du dictionnaire
	    type_du_champ = infos["type"]
	    description_du_champ = infos["description"]
	    
	    # On construit le tuple attendu par Pydantic : (Type, Field(..., description="..."))
	    champs_dynamiques[nom_champ] = (
	        type_du_champ, 
	        Field(..., description=description_du_champ)
	    )

	# Génération de la classe
	ClasseDynamique = create_model(
	    config_json["nom_modele"], 
	    **champs_dynamiques
	)

	return ClasseDynamique




def LoadPrompt(filepath):

    """
    Charge un prompt à partir d'un filepath
    """
    
    with open(filepath, "r", encoding="utf-8") as fichier:
        prompt = fichier.read()
    
    return prompt




import json

import json

def LoadConfig(chemin_fichier: str) -> dict:
    
    # On définit uniquement les briques de base. 
    # Python s'occupera d'assembler les imbrications tout seul.
    types_de_base = {
        "bool": bool,
        "str": str,
        "int": int,
        "float": float,
        "list": list,
        "dict": dict
    }

    with open(chemin_fichier, "r", encoding="utf-8") as fichier:
        donnees = json.load(fichier)

    def remplacer_types(noeud):
        if isinstance(noeud, dict):
            for cle, valeur in noeud.items():
                if cle == "type" and isinstance(valeur, str):
                    try:
                        # eval "lit" la chaîne (ex: "list[str]") et la transforme en vrai type Python.
                        # {"__builtins__": None} bloque l'exécution de fonctions dangereuses.
                        noeud[cle] = eval(valeur, {"__builtins__": None}, types_de_base)
                    except Exception as e:
                        raise ValueError(f"Impossible de décoder le type '{valeur}'. Erreur : {e}")
                else:
                    remplacer_types(valeur)
        return noeud

    return remplacer_types(donnees)
    




def SaveJson(donnees,path):

	with open(path, "w", encoding="utf-8") as fichier:
	    json.dump(donnees, fichier, ensure_ascii=False, indent=4)




import json
import os
import math

def save_dict_in_batches(data_dict, batch_size, output_dir, prefix):
    os.makedirs(output_dir, exist_ok=True)
    items = list(data_dict.items())
    pad_len = max(3, len(str(math.ceil(len(items) / batch_size))))
    
    for i in range(0, len(items), batch_size):
        batch = dict(items[i:i + batch_size])
        batch_id = str((i // batch_size) + 1).zfill(pad_len)
        filepath = os.path.join(output_dir, f"{prefix}_{batch_id}.json")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(batch, f, ensure_ascii=False, indent=4)


def split_in_batches(liste_entree, taille_batch):
    return [liste_entree[i:i + taille_batch] for i in range(0, len(liste_entree), taille_batch)]