from scipy.stats import beta

def define_weights(n: int) -> list:
    # Génère une liste de taille n où le dernier élément est 5, l'avant-dernier 4, etc.
    return [5 - n + 1 + i for i in range(n)]

def define_true_occurences(bool_list: list, weights_list: list) -> int:
    # Vérifie que les deux listes sont de taille égale
    if len(bool_list) != len(weights_list):
        raise ValueError("Les deux listes doivent être de même taille.")
    
    # Somme les poids dont l'index correspond à un booléen True
    return sum(w for b, w in zip(bool_list, weights_list) if b)

def define_statistics(bool_list: list) -> tuple:
    # Génère la liste de poids
    weights = define_weights(len(bool_list))
    
    # Calcule les true occurrences
    true_occ = define_true_occurences(bool_list, weights)
    
    # Calcule toutes les occurrences (somme totale des poids)
    total_occ = sum(weights)
    
    return (true_occ, total_occ)

def median_beta(stats: tuple) -> float:
    positives, total = stats
    
    # La valeur séparant la masse en 50% / 50% correspond à la médiane (Percent Point Function à 0.5)
    # pour la loi Beta de paramètres (positives, total).
    return beta.ppf(0.5, positives, total)

def define_difficulty_score(bool_list: list) -> float:
    bool_list = [not b for b in bool_list]
    # Calcule les statistiques à partir de la liste de booléens
    pos,tot = define_statistics(bool_list)
    neg = tot - pos
    stats = pos+1,neg+1
    print(stats)
    
    # Renvoie la médiane de la distribution Bêta correspondante
    return median_beta(stats)