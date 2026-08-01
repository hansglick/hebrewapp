Préambule : si tu veux savoir comment les données auxquelles je fais référence sont structurées, tu peux consulter les fichiers suivants :

* claude\_data\_json.md : contient la structure des données disponibles pour affichage
* eval\_oral\_request\_example.py : le code python example pour envoyer une requête d'évaluation d'une réponse orale à gemini
* eval\_oral\_response\_example.json : un exemple de réponse à la requête de l'évaluation de la réponse orale à gémini
* eval\_translation\_request\_example : le code python example pour envoyer une requête d'évaluation d'une traduction écrite à gemini
* eval\_translation\_response\_example.json : un exemple de réponse à la requête de l'évaluation de la traduction écrite à gémini





J'aimerais construire une application d'apprentissage de l'hébreu.

Grosso modo, l'application fait les choses suivantes :

* Affichage d'objets
* Enregistrement d'actions de la part du user
* Requête à une API externe (gemini) déclenché par une action d'un user + Affichage de la réponse de la requête



PARTIE I - Les types d'objets qui ne sont que "affichés" par l'application :

* racine
* binyan
* expression
* presse
* chanson
* texte



PARTIE II - Les types d'objets qui en plus d'être affichés nécessitent l'enregistrement d'actions du user

* mot
* verbe
* question\_écrite (mode auto-évaluation)



PARTIE III - Les types d'objets qui en plus d'être affichés et dont les actions du user sont en partie sauvegardées nécessitent un call à une api externe et l'affichage de la réponse de l'api

* question\_écrite (mode évaluation écriture)
* question\_orale







=================================================================================================



### Objectif

Il s'agit d'une application ludique d'apprentissage de l'hébreu pour les francophones





### Ecran d'accueil

Un choix représenté par 4 logos s'offre au user :

* Un logo "Apprentissage"
* Un logo "Révisions"
* Un logo "Examen"
* Un logo "Fun!"





=================================================================================================

### Choix : accueil/Apprentissage

Si le user choisit "Apprentissage", l'écran lui propose de parcourir un des 5 chapitres :

* Chapitre 0
* Chapitre 1
* Chapitre 2
* Chapitre 3
* Chapitre 4

En dessous de chacune des propositions, il faudrait ajouter un bouton "en savoir plus". Lorsque le user cliquerait dessus, l'écran lui afficherait l'entrée "titre" et l'entrée "presentation" de l'objet chapitre associé provenant du fichier json "item\_chapitre.json". Serait également visibles, le nombre de leçons présentes au sein du chapitre accessible en prenant la taille de l'objet "lessons" du même fichier json





### Choix : accueil/Révisions

Si le user choisit "Révision" depuis l'écran d'accueil, alors s'offre à lui le choix suivant :

* Un logo Mot
* Un logo Racine
* Un logo Verbe
* Un logo Vocabulaire



### Choix : accueil/Examen

Si le user choisit "Examen" depuis l'écran d'accueil, alors s'offre à lui le choix suivant :

* Compréhension Ecrite ->

  * choix correspondant à toutes les leçons du livre représentés par la concaténation du chapitre et de la leçon séparée par un "." comme dans 1.25
  * Après sélection de la leçon, le système affiche un objet compréhension écrite. A chaque réponse, un nouvel objet est proposé. 
* Compréhension Orale ->

  * choix correspondant à toutes les leçons du livre représentés par la concaténation du chapitre et de la leçon séparée par un "." comme dans 1.25
* 



### Choix : accueil/Fun

Si le user choisit "Fun!" alors s'offre à lui le choix suivant :

* Un logo "Expressions"
* Un logo "Presse"
* Un logo "Chansons"

### 

=================================================================================================



### Choix : accueil/Apprentissage/Chapitre{index}

L'écran propose une liste de leçons à faire dérouler avec son index. Chaque item de la liste doit être la concaténation du numéro de la leçon et du titre du texte associée à cette dernière s'il existe. Une leçon ne contient pas systématiquement un texte.

* Les leçons d'un chapitre dans "item\_chapitre.json"
* Pour accéder au titre d'un texte s'il existe, récupérer la clé du text associé à la leçon dans "item\_lesson.json". Si la clé n'est pas vide, l'utiliser pour accéder à l'objet texte dans "item\_text.json". Le titre correspond à l'entrée "title" de l'objet texte



### Choix : accueil/Apprentissage/Chapitre{index}/Leçon{index}

* L'écran propose les différents types d'objets que propose la leçon sous la forme de logo :

  * Texte (pas systématiquement présent)
  * Verbes (Les verbes de la leçons uniquement)
  * Mots (Les mots de la leçons uniquement)
* Evaluation

  * Questions écrites : voir objet question écrite
  * Questions orales : voir objet question orale (associé au texte de la leçon uniquement)











\# ==================================================================================================================================================================================================================

\# PARTIE I

\# ==================================================================================================================================================================================================================



\### Affichage d'un objet racine

* accès : item\_racine.json
* 1er écran :

  * Image illustrant la racine
  * La racine écrite en hébreu
  * Un texte "en savoir plus"
  * Swipe gauche -> affichage d'un objet racine tiré aléatoirement
  * Swipe droite -> Ecran précédent
* 2e écran (si click sur "en savoir plus")

  * La racine en hébreu (grosse police)
  * Sens de la racine (petite police)
  * Mots partageant la même racine + traduction français entre parenthèses
  * Bouton logo "retour" -> 1er écran





\### Affichage d'un objet binyan

* accès : item\_binyan.json
* 1 seul écran

  * Nom du binyan (hébreu) police grosse
  * Accolé au binyan, une pastille de couleur associé au binyan (voir item\_binyan.json pour la trouver)
  * Phonétique du binyan en alphabet latin (police petite)
  * Le sens que revêt le binyan
  * Swipe gauche -> affichage du prochain objet binyan dans l'ordre
  * Swipe droite -> affichage de l'écran précédent





\### Affichage d'un objet expression

* accès : item\_expression.json
* 1er écran :

  * Image illustrant l'expression
  * Click sur image ->

    * Expression en hébreu (police grosse)
    * Translittération français (police petite)
    * Traduction français
    * Contexte d'utilisation
    * Swipe droite -> retour image illustration
  * Swipe gauche -> affichage aléatoire d'un objet expression
  * Swipe droite -> affichage écran précédent





\### Affichage d'un objet presse

* accès : item\_presse.json
* 1er écran :

  * Image illustrant la une
  * Click sur l'image ->

    * Titre en hébreu (police grande)
    * Chapeau en hébreu (police petite)
    * Titre en français (police grande)
    * Chapeau en français (police petite)
    * Swipe droite -> retour sur image illustration
  * Swipe gauche -> affichage d'un objet presse tiré aléatoirement
  * Swipe droite -> affichage de l'écran précédent





\### Affichage d'un objet chanson

* accès : item\_chanson.json
* 1 seul écran
* lecteur youtube (petit) de la chanson
* Affichage des paroles

  * Vers hébreu
  * Traduction français
  * Saut de ligne
* Swipe gauche -> affichage d'un objet chanson tiré aléatoirement
* Swipe droite -> affichage écran précédent





\### Affichage d'un objet text

* accès : item\_text.json
* 1er écran

  * Image illustrant le texte
  * Le titre du texte
  * Le numéro de la leçon entre parenthèses
  * Swipe droite -> affichage écran précédent
  * Texte "lire" -> si cliqué ->
* 2nd écran

  * Le texte (hébreu)
  * Logo haut parleur -> lit le fichier mp3 associé
  * Swipe droite -> retour au 1er écran
  * texte "traduction" -> si cliqué ->

    * texte en français
    * swipe droite -> revient au texte hébreu



\# ==================================================================================================================================================================================================================

\# PARTIE II

\# ==================================================================================================================================================================================================================



\### Affichage d'un objet mot

* accès : item\_word.json
* 1er écran :

  * Un bouton latéral radio -> "Hébreu" / "Français"
  * Un bouton latéral radio -> "révision" / "exploration"
  * Dans la partie supérieure : Le mot en hébreu (si "hébreu" sélectionné) ou en français (si "français" sélectionné)
  * mode "exploration"

    * dans la partie inférieure de l'écran : traduction du mot (hébreu ou français)
    * dans la partie de la langue réservé à l'hébreu : racine du mot, un texte accolé "en savoir plus" -> affiche l'objet racine associée si cliqué
    * dans la partie de la langue réservé à l'hébreu : un bouton logo haut parleur -> prononce le mot en hébreu (via l'api google gratuite)
    * Un swipe gauche -> affiche un nouvel objet mot tiré selon la stratégie de tirage correspondante
    * Un swipe droite -> affiche écran précédent
  * mode "révision"

    * dans la partie inférieure de l'écran un logo "?" -> (si cliqué) :

      * dans la partie de la langue réservé à l'hébreu : la racine du mot un texte accolé "en savoir plus" -> affiche l'objet racine associée si cliqué
      * dans la partie de la langue réservé à l'hébreu : un bouton logo haut parleur -> prononce le mot en hébreu (via l'api google gratuite)
      * un logo "check" vert à droite -> Enregistre "True" pour la combinaison \[user x langue x mot] + Affichage objet mot suivant tiré selon la stratégie correspondante
      * un logo "cross" rouge à gauche -> Enregistre "False" pour la combinaison \[user x langue x mot] + Affichage objet mot suivant tiré selon la stratégie correspondante
  * Les 5 dernières évaluations d'une même combinaison \[user x langue x mot] sont sauvegardées
  * Swipe gauche -> Affichage objet mot suivant (pas d'auto évaluation enregistrée) tiré selon la stratégie correspondante
  * Swipe droite -> Affichage écran précédent (pas d'auto évaluation enregistrée)
  * par défaut le mode "exploration" est coché si le user est venu par le chemin apprentissage/chapitre/leçon.
  * par défaut le mode "révision" est coché si le user est venu par le chemin révision



* stratégie de tirage : 

  * mode exploratoire : tirage aléatoire parmi les mots associés à la même leçon (voire les entrées "chapitre" et "Lesson" d'un objet mot)
  * mode révision : tirage stratifié parmi les mots associés à 





\### Affichage d'un objet verbe

* accès : item\_verbe.json / item\_binyan.json
* 1er écran

  * Verbe (hébreu) police grosse
  * Accolé au verbe, pastille de la couleur du binyan auquel appartient le verbe -> affichage de l'objet binyan (si click)
  * Logo haut parleur -> prononciation du verbe (hébreu) via api gratuite google
  * Verbe en français
  * Bouton radio latéral : "révision" / "exploration"
  * Texte "conjugaison"
  * Trois textes clickables "passé" / "présent" / "futur"
  * Swipe gauche -> affichage d'un objet verbe tiré aléatoirement
  * Swipe droite -> affichage écran précédent
* 2nd écran (si click sur "passé" / "présent" / "futur")

  * mode "exploration"

    * Affichage de la conjugaison au temps sélectionné
    * Swipe droite -> retour à l'écran précédent
  * mode "révision"

    * partie supérieure : une personne tiré aléatoirement
    * Swipe droite pour revenir au premier écran
    * Swipe gauche passe à la personne suivante (sans auto évaluation)
    * partie inférieure : un logo "?" Si click ->

      * La conjugaison au temps et à la personne demandé
      * droite bouton vert "check" -> Enregistrement True pour la combinaison \[user x verbe x temps x personne] -> nouvelle personne
      * gauche bouton rouge "cross" -> Enregistrement False pour la combinaison \[user x verbe x temps x personne] -> nouvelle personne
      * Les 5 dernières évaluations d'une même combinaison \[user x verbe x temps x personne] sont sauvegardées





\# ==================================================================================================================================================================================================================

\# PARTIE III

\# ==================================================================================================================================================================================================================



\### Affichage d'un objet question\_écrite

Une question écrite est essentiellement une phrase à traduire d'une langue à l'autre

* accès : item\_phrase.json
* 2 modes sélectionnables via bouton radio latéral : "auto-éval" / "prof éval"
* 2 modes sélectionnabeles via bouton radio latéral : "->Hébreu" / "->Français"
* Ecran divisé en une partie supérieure et partie inférieure
* mode "auto-éval"

  * La partie supérieure de l'écran affiche la phrase à traduire. Celle-ci est en français si le mode "->Hébreu" est sélectionné et en hébreu si le mode "->Français" est sélectionné
  * Logo "?" dans la partie inférieure -> si click ->

    * Affichage de la traduction
    * Affichage d'un logo "haut parleur" dans la partie de l'écran où est affiché la phrase en hébreu -> click -> lancement de la prononciation de la phrase via api google gratuite
    * Affichage bouton vert check à droite -> click -> Enregistrement True pour la combinaison \[user x phrase x langue] -> puis nouvelle question écrite affichée
    * Affichage bouton rouge cross à gauche -> click -> Enregistrement False pour la combinaison \[user x phrase x langue] -> puis nouvelle question écrite affichée
    * Les 5 dernières évaluations d'une même combinaison \[user x phrase x langue] sont sauvegardées
* mode "prof éval"

  * La partie supérieure de l'écran affiche la phrase à traduire. Celle-ci est en français si le mode "->Hébreu" est sélectionné et en hébreu si le mode "->Français" est sélectionné
  * Champ d'entrée dans la partie inférieure qui recueille la réponse écrite du user
  * Bouton "envoi" qui va envoyer une requête à l'api Gemini en prenant comme input le champ renseigné de la partie inférieure

    * Un exemple de requête en python envoyé à l'api gemini est disponible ici : "eval\_translation\_request\_example.py"
    * Un exemple de la réponse au format json est disponible ici : "eval\_translation\_response\_example.json"
  * Affichage de la réponse :

    * La note du professeur 'Gemini'
    * Le rappel de la solution proposée par l'étudiant
    * Les observations du professeur 'Gemini'
  * Il faut garder une trace des 5 dernières notes du professeur Gemini pour le combo \[phrase x langue x mode]
* swipe gauche, permet d'afficher aléatoirement un nouvel objet question écrite
* swipe droite renvoie à l'écran précédent







\### Affichage d'un objet question orale

Une question orale est basiquement une question qui porte sur l'enregistrement audio d'un objet texte.

* accès : item\_text.json
* 1 seul mode
* 1 écran divisé en deux avec une partie supérieure et une partie inférieure

  * La partie supéreure de l'écran contient

    * un logo "haut-parleur". Quand on clique dessus, le vocal se lance. Il s'agit du fichier mp3 accessible dans l'entrée voicepath d'un objet text (item\_text.json)
    * L'intitulé de la question qui porte sur l'enregistrement. Cette dernière est un item de l'entrée "questions" dans l'objet text accessible via item\_text.json. Attention toutefois, les questions n'existent pas systématiquement, il arrive que l'entrée soit une chaine de caractère vide, auquel cas, il n'y a pas de questions et on ne peut proposer l'audio associé
  * La partie inférieure de l'écran contient

    * un logo "recorder" qui permet au user d'enregistrer vocalement sa réponse à la question posée
    * un logo "envoi" qui permet d'envoyer la requête à l'api gémini. Un exemple de requête pour évaluation orale est disponible dans le fichier "eval\_oral\_request\_example.py
    * Affichage de la réponse qui se décompose en deux items. Celle-ci un json dont un exemple est disponible "eval\_oral\_response\_example.json"

      * La note du professeur Gemini (entre 1 et 5)
      * La liste des observations ou erreurs qui justifient la note
  * Il faut garder une trace des 5 dernières notes du professeur Gemini concernant un même combo \[texte x question]
  * swipe gauche, permet d'afficher aléatoirement un nouvel objet question orale
  * swipe droite renvoie à l'écran précédent











==========================================================================================



Parcours utilisateur : 

* Chaque user est associé à un niveau. Un niveau correspond à une leçon dans un chapitre. Pour "passer" un niveau, le user doit se rendre dans l'option "examen"





Remarques :

On peut arriver sur un objet Verbe, Mot, Compréhensions écrite, Compréhension orale de deux manières différentes : 

* Par le chemin des révisions : 
* Par le chemin leçon

