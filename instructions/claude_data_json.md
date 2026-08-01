# Les données

Les données de l'application sont structurées sous la forme d'objet. Il existe 10 types d'objets différents : binyan, shoresh(racine), expression, presse, chanson, verbe, word, texte, leçon, chapitre.

Ci-dessous des explications détaillées des objets :



### Objet Binyan

Il représente le binyan, i.e. le groupe auquel appartient un verbe. Chaque objet est stocké sous la forme d'un dictionnaire avec les clés suivantes :

* text: Le nom du binyan en langue hébreu
* phonetique: La phonétique en langue latine correspondant au nom du binyan
* sens: Le sens que le binyan représente
* color: La couleur du binyan

Les différents objets sont stockés dans un json à la racine du projet appelé "item\_binyan.json". Chaque clé du json correspond à un binyan écrit en langue hébreu. Exemple :

{
"פעל": {
"text": "פעל",
"phonetique": "pa'al",
"sens": "Le binyan Paal, aussi appelé Qal (qui signifie léger), est la forme verbale la plus simple et la plus courante en hébreu. Il exprime généralement une action active de base, sans nuance particulière d'intensité ou de causalité. C'est le modèle fondamental à partir duquel de nombreux autres verbes sont construits. Par exemple, des actions quotidiennes comme manger, écrire, lire, dormir ou marcher utilisent cette forme. Il n'implique pas que l'action soit subie, causée par un tiers ou réfléchie. C'est tout simplement le degré zéro de l'action verbale, représentant l'état naturel, direct et fondamental du verbe dans la langue hébraïque moderne et biblique.",
"color": "purple"
}, ...

}

### Objet Shoresh

Il représente un shoresh dans la grammaire hébreu, i.e. une racine trilitère de laquelle sont extrait divers mots de la langue hébraïque. Il existe 4000 shoresh dans la langue hébraïque. Un objet shoresh est stocké sous la forme d'un dictionnaire avec les clés suivants :

* "shoresh" : les trois lettres qui composent la racine séparé par un '-'
* "sens" : le sens contenu dans cette racine
* "words" : une liste de dictionnaires de taille 2 qui représente une liste de mots en hébreu partageant la dite racine et leur traduction en français
* "path" : le chemin relatif de l'image illustrant le sens du shoresh (la racine)

Les différents objets sont stockés dans un json à la racine du projet appelé "item\_racine.json". Chaque clé du json correspond à une racine, i.e. trois lettres hébraïques séparés chacune d'un '-'. Exemple :

{
"ה-ל-כ": {
"shoresh": "ה-ל-כ",
"sens": "La racine ה-ל-כ (He-Lamed-Kaf) exprime principalement l'idée de marcher, de se déplacer ou d'aller d'un endroit à un autre. Dans un sens plus large et métaphorique, elle englobe le concept de comportement, de mode de vie et du chemin que l'on emprunte dans l'existence. Cette notion est profondément ancrée dans la tradition juive, où le terme Halakha désigne le corpus de la loi juive, se traduisant littéralement par la voie à suivre ou le cheminement. Elle représente la progression, la continuité et la nature dynamique de l'existence, qu'il s'agisse de mouvement physique, de l'écoulement du temps ou de la conduite morale et éthique tout au long du voyage de la vie.",
"words": \[
{
"hebrew": "הליכה",
"french": "marche"
},
{
"hebrew": "הלכה",
"french": "loi juive"
},
{
"hebrew": "תהליך",
"french": "processus"
},
{
"hebrew": "מהלך",
"french": "démarche"
},
{
"hebrew": "הולך רגל",
"french": "piéton"
}
],
"path": "results/images/shoresh/shoresh\_ה-ל-כ.png"
}, ...

}



### Objet Expression

Il représente une expression israélienne ou bien un proverbe israélien ou bien un slang israélien. Un objet expression est un dictionnaire dont les entrées sont les suivantes :

* "hebreu\_sans\_nikud": la dite expression en langue hébreu
* "traduction": la traduction de la dite expression en français
* "contexte": le contexte dans lequel cette expression peut elle être prononcée
* "imagepath": le path de l'image qui illustre cette expression

Les différents objets sont stockés dans une liste json stockée à la racine du projet et appelé "item\_expression.json". Voici un exemple de la structure de l'objet :

\[
{
"hebreu\_sans\_nikud": "על הפנים",
"translitteration": "Sur le visage",
"traduction": "Catastrophique",
"contexte": "Utilisé pour décrire quelque chose de très mauvaise qualité, une situation désastreuse ou un sentiment de mal-être.",
"index": 0,
"imagepath": "results/images/expressions/proverb\_0.png",
"imagename": "proverb\_0.png"
}, ...

]



### Objet Presse

Il représente une "une de presse" d'un quotidien israélien. Cet objet est un dictionnaire dont les entrées sont les suivantes :
"title\_french": Le titre de la une du quotidien en français
"chapeau\_french": Le chapeau de la une du quotidien en français
"title\_hebrew": La traduction du titre en hébreu
"chapeau\_hebrew": La traduction du chapeau en hébreu
"imagepath": le path de l'image qui illustre la une

Les différents objets sont stockés dans une liste json sauvegardée à la racine du projet et appelée "item\_presse.json". Voici le premier item de la liste :
\[
{
"title\_french": "Un grand pas pour l'humanité",
"chapeau\_french": "L'astronaute américain Neil Armstrong est devenu le premier homme à marcher sur la Lune lors de la mission Apollo 11.",
"index": 0,
"title\_hebrew": "צעד גדול לאנושות",
"chapeau\_hebrew": "האסטרונאוט האמריקאי ניל ארמסטרונג הפך לאדם הראשון שצעד על הירח במהלך משימת אפולו 11.",
"imagepath": "results/images/events/unepresse\_00.png",
"imagename": "unepresse\_00.png"
}, ...
]





### Objet Chanson

Il représente une chanson israélienne. Cet objet est un dictionnaires dont les entrées sont les suivantes : 

* titre : le titre de la chanson sur YouTube
* lien\_youtube : l'adresse url de la chanson sur YouTube
* paroles : une liste de dictionnaires, chacun d'eux ayant les entrées suivantes :

  * index : index ou rang du vers de la chanson
  * hebrew : le vers en hébreu
  * french : sa traduction en français

Les différents objets sont stockés dans une liste json sauvegardée à la racine du projet, appelée "item\_chanson.json". Voici un exemple d'un objet chanson  :

&#x20; {

&#x20;   "titre": "אייל גולן - עיר נמל",

&#x20;   "lien\_youtube": "https://www.youtube.com/watch?v=UAP9A-0HlqU",

&#x20;   "paroles": \[

&#x20;     {

&#x20;       "index": 1,

&#x20;       "hebrew": "מסתובב ברחובות",

&#x20;       "french": "Je me promène dans les rues"

&#x20;     },

&#x20;     {

&#x20;       "index": 2,

&#x20;       "hebrew": "בין שקיעות של בין ערביים",

&#x20;       "french": "Entre les couchers de soleil du crépuscule"

&#x20;     },

&#x20;     {

&#x20;       "index": 3,

&#x20;       "hebrew": "הקולות והריחות",

&#x20;       "french": "Les voix et les odeurs"

&#x20;     }, ...

&#x20;   ]

&#x20; }



### Objet Verbe

Il représente un verbe de la langue hébréu. Cet objet est représenté par un dictionnaire JSON dont les entrées sont les suivantes :
"original": la chaine de caractère qui représente le verbe en langue hébreu (avec nikud)
"binyan": le binyan en langue hébreu auquel appartient le verbe
"racine": la racine trilitère ou shoresh (trois lettres hébraïque séparées chacune par '-') du verbe
"traduction": la traduction en français du verbe
"chapter": le chapitre duquel est tiré le verbe (nombres en chaîne de caractère)
"lesson": la leçon delaquelle est tiré le verbe (nombres en chaîne de caractère)
"frequency": Le nombre de fois que le verbe apparaît dans le cours
"pure": la chaine de caractère qui représente le verbe en langue hébreu (sans nikud)
"conjugaisons": la conjugaison du verbe au trois temps : passé, présent, futur

L'entrée "conjugaisons" est elle même un dictionnaire. Voici un exemple de la première entrée (correspondant au temps présent) de ce dictionnaire pour un verbe spécifique :

"present": {
"0": {
"conjugaison": "מקרר",
"personne": "masculin singulier"
},
"1": {
"conjugaison": "מקררים",
"personne": "masculin pluriel"
},
"2": {
"conjugaison": "מקררת",
"personne": "féminin singulier"
},
"3": {
"conjugaison": "מקררות",
"personne": "féminin pluriel"
}
}

Les objets 'verbe' sont stockés dans un json sauvegardé à la racine dont le nom est "item\_verbe.json". Chaque clé du dictionnaire représente le nom du verbe à la forme infinitive. Voici en guise d'exemple, le début de sa structure :

{
"לקרר": {
"original": "לְ קָ רֵ ר",
"binyan": "פיעל",
"racine": "ק-ר-ר",
"traduction": "refroidir",
"value": 406,
"chapter": "4",
"lesson": "06",
"frequency": 1,
"pure": "לקרר",
"conjugaisons": { ... }
}, ...
}

### Objet Mot

Un objet 'mot' est un dictionnaire représenté par les entrées suivantes :

* "original": représente le mot en langue hébreu (avec nikud)
* "racine": représente la racine (le shoresh) du mot, i.e. trois lettres hébraïques séparées chacune par un '-'
* "chapter": le chapitre duquel est extrait le mot. C'est un nombre au format chaîne de caractères
* "lesson": la leçon de laquelle est extraite le mot. C'est un nombre au format chaîne de caractères
* "frequency": Le nombre de fois que le mot apparaît dans le cours
* "french": la traduction du mot en français
* "pure": représente le mot en langue hébreu (sans nikud)

Les objets sont stockés dans un json situé à la racine du projet sous le nom "item\_word.json". Les clés du json représentent le mot en hébreu sans nikud. En guise d'exemple, voici la première entrée du json :
{
"מוקד": {
"original": "מוֹקֵד",
"racine": "י-ק-ד",
"value": 409,
"chapter": "4",
"lesson": "09",
"frequency": 1,
"french": "Centre téléphonique",
"pure": "מוקד"
}, ...
}



### Objet Phrase

Cet objet est une phrase en hébreu et essentiellement sa traduction en français. Il est représenté par un dictionnaire dont les entrées sont les suivantes :

* "hebrew": une phrase en langue hébreu (sans nikud)
* "french": la traduction de la phrase en français
* "chapter": le chapitre duquel est extrait la phrase. Il s'agit d'un nombre au format chaîne de caractères
* "lesson": la leçon de laquelle est tirée la phrase. Il s'agit d'un nombre au format chaîne de caractères

Les objets sont stockés dans un json situé à la racine du projet sous le nom "item\_phrase.json". Les clés du json représentent la concaténation du chapitre et de la leçon (séparés par un '.') desquels sont extraites les phrases. La valeur de l'entrée est une liste de dictionnaires, chacun représentant un objet phrase. En guise d'exemple, voici une entrée du json :
"0.14": \[
{
"hebrew": "אני רואה את החברים במרכז העיר.",
"french": "Je vois les amis dans le centre-ville.",
"value": 14,
"chapter": "0",
"lesson": "14",
"origin": "exercice",
"index": 0
},
{
"hebrew": "אני אוהב עוגות.",
"french": "J'aime des gâteaux.",
"value": 14,
"chapter": "0",
"lesson": "14",
"origin": "exercice",
"index": 0
}, ...
]

### Objet Texte

C'est un objet qui représente un texte en hébreu et d'autres informations complémentaires. Il existe sous la forme d'un dictionnaire dont les entrées sont les suivantes:
"text": le text en langue hébreu sous la forme d'une chaîne de caractères
"title": Le titre du texte en langue hébreu
"lesson": la concaténation du chapitre et de la leçon (séparés par un '.') duquel est extrait le texte
"phrases": La liste des phrases qui constituent le texte et leur traduction en français
"imagepath": le path de l'image qui illustre ce texte
"voicepath": le path de la piste audio associé au texte

"questions" : une liste de dictionnaires représentant chacun une question à propos du texte

Un item de la liste 'phrases' contient les caractéristiques suivantes :

* index : l'index de la phrase au sein du texte
* hebrew : la phrase en langue hébreu
* french : la phrase en langue française



Les objets 'texte' sont stockés dans un json situé à la racine du projet dont le nom est : "item\_text.json". Les clés du json représentent la concaténation du chapitre et de la leçon (séparés par un '.') desquels sont extraites les textes. La valeur d'une entrée représente un objet 'texte', en voici un exemple :
"0.05": {

&#x20;       "text": "שלמה גר בתל אביב. הוא לומד עברית באולפן בתל אביב. הוא גר על יד תל אביב בדירה קטנה. בדירה יש שולחן גדול כיסא ומיטה קטנה. בדירה יש ספרים אבל אין טלוויזיה. שלמה לומד בדירה, קורא ספר ושומע מוסיקה. מהחלון בדירה הוא רואה מכוניות, אוטובוסים וגם גינה גדולה. בשבת, שלמה לא עובד ולא לומד הוא נח.",

&#x20;       "title": "הדירה של שלמה",

&#x20;       "lesson": "0.05",

&#x20;       "phrases": \[

&#x20;           {

&#x20;               "index": 0,

&#x20;               "hebrew": "שלמה גר בתל אביב.",

&#x20;               "french": "Shlomo habite à Tel Aviv."

&#x20;           },

&#x20;           {

&#x20;               "index": 1,

&#x20;               "hebrew": "הוא לומד עברית באולפן בתל אביב.",

&#x20;               "french": "Il étudie l'hébreu dans un oulpan à Tel Aviv."

&#x20;           },

&#x20;           {

&#x20;               "index": 2,

&#x20;               "hebrew": "הוא גר על יד תל אביב בדירה קטנה.",

&#x20;               "french": "Il habite près de Tel Aviv dans un petit appartement."

&#x20;           },

&#x20;           {

&#x20;               "index": 3,

&#x20;               "hebrew": "בדירה יש שולחן גדול כיסא ומיטה קטנה.",

&#x20;               "french": "Dans l'appartement, il y a une grande table, une chaise et un petit lit."

&#x20;           },

&#x20;           {

&#x20;               "index": 4,

&#x20;               "hebrew": "בדירה יש ספרים אבל אין טלוויזיה.",

&#x20;               "french": "Dans l'appartement, il y a des livres mais il n'y a pas de télévision."

&#x20;           },

&#x20;           {

&#x20;               "index": 5,

&#x20;               "hebrew": "שלמה לומד בדירה, קורא ספר ושומע מוסיקה.",

&#x20;               "french": "Shlomo étudie dans l'appartement, lit un livre et écoute de la musique."

&#x20;           },

&#x20;           {

&#x20;               "index": 6,

&#x20;               "hebrew": "מהחלון בדירה הוא רואה מכוניות, אוטובוסים וגם גינה גדולה.",

&#x20;               "french": "De la fenêtre de l'appartement, il voit des voitures, des bus et aussi un grand jardin."

&#x20;           },

&#x20;           {

&#x20;               "index": 7,

&#x20;               "hebrew": "בשבת, שלמה לא עובד ולא לומד הוא נח.",

&#x20;               "french": "Le samedi, Shlomo ne travaille pas et n'étudie pas, il se repose."

&#x20;           }

&#x20;       ],

&#x20;       "questions": \[

&#x20;           {

&#x20;               "index": 0,

&#x20;               "hebrew": "איפה שלמה גר ?",

&#x20;               "french": "Où habite Shlomo ?"

&#x20;           },

&#x20;           {

&#x20;               "index": 1,

&#x20;               "hebrew": "יש טלוויזיה בדירה ?",

&#x20;               "french": "Y a-t-il une télévision dans l'appartement ?"

&#x20;           },

&#x20;           {

&#x20;               "index": 2,

&#x20;               "hebrew": "מה שלמה עושה בדירה ?",

&#x20;               "french": "Que fait Shlomo dans l'appartement ?"

&#x20;           },

&#x20;           {

&#x20;               "index": 3,

&#x20;               "hebrew": "מה שלמה רואה מהחלון ?",

&#x20;               "french": "Que voit Shlomo depuis la fenêtre ?"

&#x20;           }

&#x20;       ],

&#x20;       "imagepath": "results/images/text/chapitre\_illustration\_0.05\_text.png",

&#x20;       "voicepath": "results/voice/text/0.05\_dialogue.mp3"

&#x20;   },





### Objet Leçon

C'est un objet qui définit une leçon du cours. Il est représenté par un dictionnaire dont les entrées sont les suivantes:

* verbs : c'est une liste de verbes en hébreu à la forme infinitive. Chacun des items de la liste correspond à une clé du json "item\_verb.json"
* words : c'est une liste de mots en hébreu. Chacun des items de la liste correspond à une clé du json "item\_word.json"
* text : une chaîne de caractères représentant la clé de l'objet 'text' dans le json "item\_text.json"
* global\_verbs : même structure que l'entrée 'verbs'
* global\_words : même structure que l'entrée 'words'
* global\_texts : liste de clés du json "item\_text.json"
* global\_phrases : liste de clés du json "item\_phrase.json"

Les objets sont stockés dans le json "item\_lesson.json". Chaque clé du json correspond à la concaténation d'un chapitre et d'une leçon (séparé par un '.'). Voici un exemple d'objet leçon et sa clé 0.26 :
"0.26": {
"verbs": \[],
"words": \[],
"text": "",
"phrases": "0.26",
"global\_verbs": \["לקנות","לגור", ...],
"global\_words": \["דבר","ספר",...],
"global\_texts": \["0.01","0.02", ...],
"global\_phrases": \["0.24","0.25",...]
}





### Objet Chapitre

Ce type d'objet représente un chapitre. Il est stocké sous la forme d'un dictionnaire dont les entrées sont les suivantes:

* lessons : une liste de clés du json "item\_lesson.json"
* presentation : un texte de quelques lignes qui présente le chapitre
* titre : le titre du chapitre

Les objets 'chapitre' sont stockés à la racine du projet dans le json dénommé "item\_chapitre.json". Les clés de ce json correspondent au numérotage des 5 chapitres (au format string), allant du "0" à "4". En guise d'exemple, voici une entrée (un objet 'chapitre') et sa clé () du json 'item\_chapitre.json' :

"4": {
"lessons": \[
"4.01",
"4.02",
"4.03",
"4.04",
"4.05",
"4.06",
"4.08",
"4.09"
],
"presentation": "Découvrez notre parcours 'Pubs israéliennes' sur acoursdhebreu.com. Ce parcours, élaboré en collaboration avec Guy Sharett (Streetwise hebrew) et Elie Cohen, vous permettra de plonger dans la langue et la culture israélienne en analysant des publicités pleine d'humour.",
"titre": "Avancés +"
}

