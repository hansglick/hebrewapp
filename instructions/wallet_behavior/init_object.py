import simulation as sim
import os
from pathlib import Path
from datetime import datetime
from zoneinfo import ZoneInfo
import importlib

noms_fichiers = ['2.28',
 '2.29',
 '2.30',
 '2.31',
 '2.32',
 '2.33',
 '2.34',
 '2.35',
 '2.36',
 '2.37',
 '2.38',
 '2.39',
 '2.40',
 '2.41',
 '2.42',
 '2.43',
 '2.44',
 '2.45',
 '2.46',
 '2.47',
 '2.48',
 '2.49',
 '2.50',
 '3.01',
 '3.02',
 '3.03',
 '3.04',
 '3.05',
 '3.06',
 '3.07',
 '3.08',
 '3.09',
 '4.01',
 '4.02',
 '4.03',
 '4.04',
 '4.05',
 '4.06',
 '4.08',
 '4.09',
 '0.01',
 '0.02',
 '0.03',
 '0.04',
 '0.05',
 '0.06',
 '0.07',
 '0.08',
 '0.09',
 '0.10',
 '0.11',
 '0.12',
 '0.13',
 '0.14',
 '0.15',
 '0.16',
 '0.17',
 '0.18',
 '0.19',
 '0.20',
 '0.21',
 '0.22',
 '0.23',
 '0.24',
 '0.25',
 '0.26',
 '0.27',
 '0.28',
 '0.29',
 '0.30',
 '0.31',
 '0.32',
 '0.33',
 '0.34',
 '0.35',
 '0.36',
 '0.37',
 '0.38',
 '0.39',
 '0.40',
 '0.41',
 '0.42',
 '0.43',
 '0.44',
 '0.45',
 '0.46',
 '0.47',
 '0.48',
 '1.01',
 '1.02',
 '1.03',
 '1.04',
 '1.05',
 '1.06',
 '1.07',
 '1.08',
 '1.09',
 '1.10',
 '1.11',
 '1.12',
 '1.13',
 '1.14',
 '1.15',
 '1.16',
 '1.17',
 '1.18',
 '1.19',
 '1.20',
 '1.21',
 '1.22',
 '1.23',
 '1.24',
 '1.25',
 '1.26',
 '1.27',
 '1.28',
 '1.29',
 '1.30',
 '1.31',
 '1.32',
 '1.33',
 '1.34',
 '1.35',
 '1.36',
 '1.37',
 '1.38',
 '1.39',
 '1.40',
 '1.41',
 '1.42',
 '1.43',
 '1.44',
 '1.45',
 '2.01',
 '2.02',
 '2.03',
 '2.04',
 '2.05',
 '2.06',
 '2.07',
 '2.08',
 '2.09',
 '2.11',
 '2.12',
 '2.13',
 '2.14',
 '2.15',
 '2.16',
 '2.17',
 '2.18',
 '2.19',
 '2.20',
 '2.21',
 '2.22',
 '2.23',
 '2.24',
 '2.25',
 '2.26',
 '2.27']




def fonction_perte(
    periodes: int,
    cartes_debut_inactivite: int,
) -> int:
    """
    Renvoie la perte cumulative après `periodes` périodes d'inactivité.

    Pertes supplémentaires :
    - période 1 : 1 carte
    - période 2 : 2 cartes
    - période 3 : 4 cartes
    - période 4 : 8 cartes
    - etc.
    """
    if isinstance(periodes, bool) or not isinstance(periodes, int):
        raise TypeError("periodes doit être un entier")

    if periodes < 0:
        raise ValueError("periodes doit être positif ou nul")

    if (
        isinstance(cartes_debut_inactivite, bool)
        or not isinstance(cartes_debut_inactivite, int)
    ):
        raise TypeError(
            "cartes_debut_inactivite doit être un entier"
        )

    if cartes_debut_inactivite < 0:
        raise ValueError(
            "cartes_debut_inactivite doit être positif ou nul"
        )

    perte_cumulative = int(2**(periodes - 1) / 1)

    return min(
        perte_cumulative,
        cartes_debut_inactivite,
    )



# Config


programme = sim.creer_programme(
    noms_lecons=noms_fichiers,
    mode_bonus="each_lesson",
)


config_points = {
    "facile": 10,
    "moyen": 25,
    "difficile": 50,
    "bonus": 25,
}

config_behavior = {"nombre_heures_par_jour":0.45,
                  "p_here":6/7}

config_performance = {"p_exam_facile": 0.9,
    "p_exam_moyen": 0.8,
    "p_exam_difficile": 0.75,
    "p_exam_bonus": 0.6,}


config_time = {"debut_simulation":datetime.now(
        ZoneInfo("Europe/Paris")
    ),
               "nombre_jours":99999}


config_game = {"f1":3.5,
               "nombre_cartes_collection":230,
               "perte_inactivite":fonction_perte,
               "variance_lognormale":0.4,
               "duree_periode_inactivite":86400,
               "config_points":config_points,
"programme":programme}

config_all = {**config_behavior,**config_performance,**config_time,**config_game}



# Initialisation de l'objet

user_wallet = sim.Simulation(**config_all)


