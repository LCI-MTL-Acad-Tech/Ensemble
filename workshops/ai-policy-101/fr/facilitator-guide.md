# Atelier sur le Guide IA — une séance en présentiel d'une heure pour le personnel enseignant
### Version française — construite pour Classroom Live (`control.py`)

Construit à partir des pages de l'intranet LCI Éducation d'Elisa Schaeffer
(éthique, pratique, outils, évaluation, formation) et de la conférence AQPC
2026 *« Rester sur la même page sur l'IA ».* Ceci est la version française,
adaptée directement du pilote anglais une fois celui-ci rodé — même
structure, même minutage, mêmes gabarits, mais texte et libellés en
français.

**Public :** le personnel enseignant, pas les étudiant.e.s. **Taille du
groupe :** 40 à 60 personnes de différents programmes, effectif inconnu
avant le jour même — rien ci-dessous n'exige de le connaître d'avance
(voir la note sur la formation des groupes plus bas). **Objectif :** à la
fin, chacun.e peut (1) énoncer de mémoire l'échelle à 5 niveaux d'usage de
l'IA, (2) savoir où trouver les deux politiques qui encadrent le tout, et
(3) avoir rédigé des consignes de niveau 1 et de niveau 3 pour une vraie
évaluation.

### Une note sur la taille des groupes et les activités partagées

À 40-60 personnes, trois activités partagent un petit nombre fixe de
« places » que tout le monde cherche à occuper en même temps : l'exercice
d'ordonnancement (5 rangées) et les deux exercices à trous (5-6 espaces
chacun). Seule une poignée de personnes peut remporter chaque glisser
individuel — dites-le à voix haute avant le premier exercice (« seulement
quelques-un.e.s d'entre vous réussiront à placer une pièce à chaque tour,
et c'est normal — vous pouvez toutes et tous réagir et voir le résultat se
construire en direct, ce n'est pas une course que vous êtes censé.e.s
gagner personnellement »). Cela a été testé à cette échelle (55
participant.e.s simulé.e.s se disputant la même place unique : une seule
réussite, les autres ont reçu un message clair « quelqu'un vous a devancé,
réessayez » — aucune action n'est jamais silencieusement perdue ni
appliquée sur une image périmée), donc la mécanique tient la route ; la
seule chose à gérer est l'attente de la salle quant à qui peut réellement
glisser quelque chose.

## Avant l'ouverture de la salle

```bash
uvicorn server.main:app --host 0.0.0.0 --port 8000        # sur l'ordinateur hôte
python control.py session reset                            # table rase
python control.py moderation reset                          # les mots par défaut conviennent pour une salle de collègues
```

Ouvrez vous-même l'adresse de connexion (`http://<IP-locale-du-portable>:8000/`),
connectez-vous avec un nom, puis ouvrez le tiroir 📱 **Rejoindre par code
QR** dans la barre du haut et projetez-le avant l'arrivée des gens. Il
encode toujours l'adresse actuellement dans votre barre de navigateur,
donc il est correct que vous soyez sur le port 8000 ou un autre, et peu
importe l'adresse IP locale attribuée par le routeur ce jour-là — rien à
saisir manuellement dans un générateur de code QR. N'importe qui peut
ouvrir ce même tiroir sur son propre appareil aussi, pour qu'un.e
retardataire puisse scanner l'écran d'un.e voisin.e plutôt que d'attendre
après vous.

### Capacité réseau

Le routeur de voyage portatif prévu pour ce genre de séance gère jusqu'à
90 appareils. 40 à 60 enseignant.e.s tient largement dans cette limite,
même en tenant compte du fait que certain.e.s apportent à la fois un
téléphone et un portable. Si une séance dépasse un jour environ 80-85
appareils prévus, ou qu'on vous annonce qu'elle se déroulera dans une
salle beaucoup plus grande, contactez le service TI à l'avance pour un
vrai WiFi d'événement plutôt que de compter sur le routeur de voyage — ce
n'est pas quelque chose à découvrir en voyant les gens échouer à se
connecter en pleine séance.

### La façon simple de l'animer

Tout ce qui suit est aussi encodé comme script exécutable pas à pas —
`script.json` dans ce dossier. Plutôt que de taper chaque commande à la
main pendant la séance :

```bash
python control.py script run workshops/ai-policy-101/fr/script.json
```

Ceci affiche le nom et l'aide-mémoire de l'étape en cours, déclenche ses
actions (chargement/épinglage) immédiatement, puis attend :

- **Entrée** → passer à l'étape suivante
- **b** → revenir une étape en arrière (sûr à utiliser en cas d'avance
  accidentelle — cela relance simplement les actions de l'étape
  précédente, ce qui réépingle/recharge ce qu'elle montrait, donc les
  écrans de la salle reviennent où ils étaient)
- **r** → relancer l'étape actuelle (utile si un épinglage n'a visiblement
  pas atteint quelqu'un, ou pour réafficher quelque chose)
- **g N** → sauter directement à l'étape N (ex. `g 5`)
- **l** → lister toutes les étapes avec votre position actuelle marquée
- **q** → quitter le pas-à-pas (la séance elle-même continue de
  fonctionner — ça ne quitte que le contrôleur du script)

L'étape 1 est une diapositive de bienvenue, pas une portion chronométrée
de l'heure — lancez `script run` dès que vous êtes prêt.e, bien avant
l'heure officielle de départ, et laissez-la simplement affichée pendant
que les gens arrivent et se connectent au compte-gouttes. Comme elle est
épinglée, tout le monde qui se connecte pendant cette période y atterrit
directement plutôt que sur un tableau blanc vide. Passez à l'étape 2 (la
mise en train) une fois que la majorité de la salle est arrivée.

Le reste de ce guide est le même déroulé en prose, avec le raisonnement et
les points à aborder détaillés — utile pour répéter à l'avance et pour
adapter la séance plus tard, mais les vrais gestes pendant le cours se
résument à la commande `script run` ci-dessus plus Entrée/b/r/g/l/q.

---

## 0:00–0:05 — Mise en train : un mot

**Dire :** « Avant de commencer, ajoutez un mot au tableau partagé :
quelle est votre relation actuelle avec l'IA dans votre enseignement,
honnêtement ? »

```bash
python control.py pin tags
```

Laissez-le se remplir pendant environ 2 minutes, puis regardez-le ensemble
— sans trop l'analyser, notez simplement à voix haute s'il y a un
regroupement évident (« beaucoup de "curieux.se" et de "dépassé.e" dans la
même salle — c'est normal, c'est pour ça qu'on est ici »).

---

## 0:05–0:10 — Vérification de départ

**Dire :** « Avant tout contenu — réglez votre statut. 🙂 = je me sens
clair.e sur ce qui est permis dans mes propres évaluations en ce moment.
😕 = plutôt incertain.e. 🆘 = plutôt perdu.e. 💤 = honnêtement, je n'y ai
pas encore pensé. Pas de mauvaise réponse, on y revient à la fin. »

```bash
python control.py pin traffic
```

Notez la répartition approximative à voix haute, puis passez à la suite —
n'en discutez pas encore, l'intérêt est la *comparaison* à 0:57.

---

## 0:10–0:20 — L'échelle à cinq niveaux

**Points à aborder** (2-3 minutes, tirés de la page Évaluer) :

- L'ambiguïté sur l'IA dans les évaluations crée de l'anxiété chez les
  étudiant.e.s et de l'incohérence entre les groupes-cours. Quand les
  attentes ne sont pas énoncées, certain.e.s dépendent trop de l'IA au
  détriment de leur propre apprentissage ; d'autres l'évitent
  complètement par crainte. Ni l'un ni l'autre ne les sert.
- LCI Éducation utilise une **échelle à cinq niveaux** pour classifier
  l'usage de l'IA dans les travaux notés — elle donne à tout le monde un
  vocabulaire commun, et elle doit être déclarée **par évaluation**, pas
  comme politique générale de cours, parce que le bon niveau dépend de ce
  qu'on cherche réellement à mesurer.
- Parcourez brièvement les cinq niveaux (0 = interdit, 1 = planification
  seulement, 2 = collaboration sur les brouillons/rétroaction, 3 = IA
  utilisée de façon extensive mais dirigée et justifiée, 4 = IA comme
  partenaire créatif, évaluation co-conçue).

**Activité :** chargez l'exercice d'ordonnancement et épinglez-le.

```bash
python control.py order load workshops/ai-policy-101/fr/order-ai-scale.json --pin
```

**Dire :** « Voici les cinq énoncés type de consigne, mélangés. Glissez-les
dans l'ordre du plus restrictif au plus ouvert. Coche verte quand votre
rangée vous semble correcte ; on révèle la réponse une fois que la
majorité de la salle s'est stabilisée. »

Après environ 5 minutes, ou une fois que `python control.py status`
indique l'exercice terminé :

```bash
python control.py order reveal
```

Discutez de ce qui a surpris les gens. C'est la seule activité à ne pas
sauter ni précipiter — tout le reste de l'heure fait référence à ces cinq
niveaux par leur numéro.

---

## 0:20–0:30 — Associer la préoccupation à la discipline

**Dire :** « Différents domaines s'inquiètent de choses différentes en
matière d'IA, et ça vaut la peine d'en entendre les raisons — aucune
préoccupation n'est "fausse", elle vient simplement d'un endroit
différent. Glissez chaque inquiétude vers la discipline la plus
susceptible de la soulever. Quelques pièces sont des leurres — des
préoccupations transversales qui n'appartiennent pas plus à un domaine
qu'à un autre. »

```bash
python control.py blanks load workshops/ai-policy-101/fr/blanks-disciplines.json --pin
```

Chaque pièce a aussi un petit menu déroulant numéroté à côté — une
solution de rechange au glisser-déposer pour quiconque trouve le glisser
difficile sur un téléphone, toujours visible plutôt qu'un réglage qu'il
faut d'abord trouver et activer. Mentionnez-en l'existence brièvement une
fois, puis laissez la salle travailler.

Les cinq associations (Sciences infirmières/jugement clinique,
Informatique/code qu'on ne peut pas déboguer, Design/à qui appartient le
travail, Administration/données fabriquées, Lettres/lecture attentive)
plus trois leurres (coût environnemental, fiabilité des détecteurs,
disponibilité des licences — des préoccupations réelles, simplement pas
propres à une discipline). Une fois que la plupart des gens ont terminé :

```bash
python control.py blanks reveal
```

Ceci note chaque espace en place (✓/✗ à côté de chaque pièce, plus un
score) et fonctionne comme `order reveal` — le glisser-déposer reste
possible ensuite si quelqu'un veut corriger une association. Parcourez
les cinq bonnes associations ensemble et demandez : **« laquelle
ressemble le plus à une inquiétude que vous avez déjà eue ? »** — c'est
généralement le moment où la salle commence à se parler entre elle plutôt
qu'à vous seulement.

**Vaut un aparté de 30 secondes ici, sans activité nécessaire :** un
sondage du printemps 2026 mené auprès du réseau LCI — 136 répondant.e.s,
11 établissements, 340 programmes — a révélé que 93 % voient l'IA comme
un partenaire créatif ou un accélérateur plutôt qu'une menace, et 66 %
ont spécifiquement mentionné « l'employabilité hybride », soit
l'attente que les diplômé.e.s travailleront aux côtés d'outils IA de
façon professionnelle. Un contexte utile pour « les préoccupations sont
réelles, mais la posture générale aussi » avant de continuer.

---

## 0:30–0:40 — Des faits à retenir

**Dire :** « Petit tour de renforcement — glissez la bonne pièce dans
chaque espace. Il y a aussi quelques leurres dans la réserve. »

```bash
python control.py blanks load workshops/ai-policy-101/fr/blanks-ai-ethics.json --pin
```

Une fois que la plupart des gens l'ont complété :

```bash
python control.py blanks reveal
```

Lisez le paragraphe complété à voix haute avec le score affiché, et
détaillez brièvement les deux faits les plus susceptibles d'être nouveaux
pour la salle :

- **Détecteurs et faux positifs** : les détecteurs signalent à outrance
  l'écriture forte et fluide (le style qu'on cherche à enseigner) et sont
  biaisés contre les personnes non natives de l'anglais. Un score
  « probablement 85 % IA » n'est pas une certitude de 85 % — c'est une
  probabilité issue d'un modèle imparfait. Les détecteurs peuvent orienter
  une enquête quelque part ; ils ne peuvent jamais la conclure.
- **Ce qui fonctionne réellement à la place** : un contexte authentique et
  précis que l'IA ne peut pas inventer ; une soutenance orale (quelqu'un
  qui ne comprend pas son propre travail ne peut pas le défendre en
  direct) ; documenter le processus, pas seulement le produit ; demander
  une réflexion personnelle sur une expérience vécue.

---

## 0:40–0:50 — Remaniement en groupes

**Dire :** « Trouvez votre groupe sur cet onglet — la tâche est juste là
avec lui, et elle reste visible tout le long, même une fois la minuterie
lancée. »

```bash
python control.py groups make --mode size --param 4 \
  --prompt "Prenez 10 minutes pour réfléchir à la façon dont un concept du cours se rattache à un exemple concret, et soyez prêt.e à en discuter.

Dans votre groupe, réécrivez ces consignes deux fois :

Niveau 1 — IA seulement pour la planification.
La réflexion finale doit être entièrement la pensée propre de l'étudiant.e.

Niveau 3 — IA utilisée de façon extensive.
L'étudiant.e doit diriger et justifier la façon dont il ou elle l'a utilisée.

Affichez votre version de niveau 3 comme note autocollante sur l'onglet Tableau blanc." \
  --pin
```

L'onglet Groupes est maintenant une seule vue unifiée — la tâche, les
cartes de groupe et une minuterie en direct, tout ensemble, pour que
personne n'ait à se souvenir d'une tâche énoncée seulement à voix haute
ni à changer d'onglet pour vérifier le temps restant. Avec un effectif
inconnu (40-60), `--mode size --param 4` est plus facile à gérer en
direct que de deviner un *nombre* de groupes — vous dites « visez des
groupes de 4 » plutôt que de précalculer combien de groupes cela
implique. Le regroupement ne laisse jamais un groupe descendre sous la
taille demandée : si la salle ne se divise pas également par 4, certains
groupes grossissent à 5 plutôt que de voir apparaître un groupe résiduel
de 1 ou 2 personnes (ex. : 47 personnes deviennent huit groupes de 4 et
trois de 5 — vérifiez avec `python control.py status` juste après si vous
voulez voir la répartition réelle avant que les gens cherchent leur nom).
Si la qualité de la discussion importe plus que la taille exacte du
groupe pour une salle donnée, `--param 3` ou `--param 5` fonctionnent de
la même façon.

Notez que la tâche est volontairement formulée comme une réflexion
*chronométrée et orale* — « prenez 10 minutes pour réfléchir... soyez
prêt.e à en parler » — plutôt qu'une réflexion écrite à nombre de mots
fixe. Une version antérieure demandait « une réflexion de 500 mots », ce
qui se lit comme quelque chose que les participant.e.s doivent eux-mêmes
s'asseoir et écrire pendant l'atelier, et il n'y a nulle part dans
l'application pour ça (les notes autocollantes sont pour de courtes
notes, pas des dissertations). Le véritable produit écrit de ce bloc, ce
sont les *consignes réécrites*, qui elles ont un endroit où aller — la
note autocollante.

Donnez-leur une minute pour trouver leur groupe et lire la tâche, puis
démarrez la minuterie — la salle reste sur le même écran Groupes tout le
long, ils passent simplement à Tableau blanc quand ils sont prêt.e.s à
afficher une note et peuvent revenir vérifier la tâche ou le temps
restant :

```bash
python control.py timer set 7
python control.py timer start
```

Pendant qu'ils travaillent, circulez. Quand la minuterie se termine,
rassemblez la salle et lisez deux ou trois notes de niveau 3 à voix haute
— les différences entre les groupes sont généralement la partie la plus
utile de ce bloc.

```bash
python control.py timer reset
```

---

## 0:50–0:57 — Auto-évaluation de clôture

```bash
python control.py spider load workshops/ai-policy-101/fr/spider-reflection.json --pin
```

**Dire :** « Évaluez-vous sur ces quatre critères dès maintenant —
personne d'autre ne voit votre nom associé à votre réponse, seulement la
forme de la salle. Le dernier critère porte sur la séance elle-même, pas
sur le contenu — soyez honnête, c'est la seule façon que ça s'améliore la
prochaine fois. »

Laissez le polygone du groupe se construire en direct pendant une minute,
puis relevez la forme : où la salle est-elle la plus forte, où
l'étalement est-il le plus large (un large étalement sur « aisance à
déclarer mon propre usage » vaut la peine d'être nommé directement — ça
signifie que les gens ont besoin de s'entendre entre eux, pas seulement
d'entendre cette séance). L'axe « productivité » est pour vous en tant
qu'animateur.trice plus que pour eux — un score bas là mérite un suivi
direct dans la période de questions qui suit.

---

## 0:57–1:00 — Revérification et questions ouvertes

```bash
python control.py pin traffic
```

**Dire :** « Même vérification qu'au départ — 🙂/😕/🆘/💤 sur la clarté de
ce qui est permis. Voyons si ça a bougé. » Comparez à voix haute avec la
lecture de 0:05.

```bash
python control.py pin qna
```

**Dire :** « La file de questions anonymes est ouverte — posez n'importe
quoi, y compris ce que vous ne vouliez pas dire à voix haute. Je la
garderai ouverte après notre départ de la salle et je ferai un suivi sur
tout ce à quoi je ne peux pas répondre maintenant. »

Si vous animez la séance via `python control.py script run ...`, cette
étape épingle l'onglet Questions et vous fait automatiquement passer à
une vue en direct — les questions apparaissent à l'instant même où
elles sont soumises, et vous pouvez taper un préfixe d'identifiant suivi
du texte de la réponse pour y répondre sur-le-champ, directement dans le
terminal, sans changer de fenêtre. Appuyez sur **b** pour revenir au
script quand vous êtes prêt.e à conclure (ou **a** à n'importe quel
moment plus tôt dans le script si vous voulez vérifier les questions
avant la toute fin — pas besoin d'attendre cette étape). Les commandes
`qna list`/`qna watch` fonctionnent de la même façon en dehors du script,
par exemple pour continuer le suivi après la séance :

```bash
python control.py qna watch          # vue en direct, se met à jour seule
python control.py qna list           # aperçu ponctuel à la place
```

---

## 1:00 — Merci / coordonnées

```bash
python control.py slide load workshops/ai-policy-101/fr/slide-thankyou.json --pin
```

**Dire :** « Merci à tous et toutes. Voici comment retrouver le Guide et
me joindre par la suite — et si vous étiez sur le routeur portatif plutôt
que votre WiFi habituel, déconnectez-vous-en maintenant pour retrouver
votre accès Internet régulier. »

Le code QR pointe vers l'URL réelle du Guide IA sur l'intranet et la
diapositive affiche votre vraie adresse courriel — les deux sont déjà
remplies, pas des espaces réservés, donc cette étape est prête à
utiliser telle quelle.

---

## Après la séance

```bash
python control.py session save "atelier-guide-ia-fr-$(date +%Y%m%d)"
python control.py log --n 100       # vérifier que rien n'a cassé pendant l'usage en direct
```

Sauvegarder sous un nom daté garde cette séance comme référence distincte
des gabarits réutilisables dans `workshops/ai-policy-101/fr/`, qui restent
des points de départ propres pour la prochaine séance.

## Sources utilisées pour cet atelier

- Intranet LCI Éducation : *Éthique et IA*, *Pratiquer l'IA*, *Outils IA
  et politiques*, *Évaluer avec l'IA*, *Se former à l'IA* (Elisa Schaeffer
  / Sous-comité IA du Global Academic Committee, 2026).
- Satu Elisa Schaeffer, *« Rester sur la même page sur l'IA »*, AQPC 2026
  (Drummondville, 4 juin 2026) — <https://satuelisa.github.io/talks/aqpc2026.html>.
- Politique sur l'utilisation responsable de l'IA ; Politique
  institutionnelle d'évaluation des apprentissages (PIEA) — toutes deux
  sur le portail Agora.
