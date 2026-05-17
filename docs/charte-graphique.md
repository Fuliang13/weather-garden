# Charte graphique — Weather Garden

Document de référence UI/UX pour Weather Garden.

Contexte source : `weather-garden-context-20260517-134635`
Image de référence visuelle : `Weather-Garden.png`
Écran prioritaire concerné : Dashboard météo / Weather Garden Radar
Portée : application complète, tous onglets, tous supports.

---

## 1. Objectif de la charte

Weather Garden doit être perçu comme un observatoire météo-jardin personnel : fiable, calme, lisible, local, précis et agréable à consulter tous les jours.

L’application ne doit jamais ressembler à :

- un dashboard crypto ;
- une console industrielle ;
- une démonstration technique ;
- une simple app météo générique ;
- un prototype empilé de cartes ;
- une interface flashy ou décorative.

L’interface doit toujours répondre à des questions concrètes :

- Est-ce qu’il pleut maintenant ?
- Est-ce qu’une pluie arrive ?
- Dans combien de temps ?
- Quelle source confirme l’information ?
- Le radar est-il frais ?
- Qu’est-ce que cela signifie pour le jardin ?
- Quelle zone ou entité du jardin est concernée ?

---

## 2. Principes visuels verrouillés

Mots-clés à respecter :

- naturel ;
- calme ;
- cartographique ;
- lisible ;
- local ;
- premium discret ;
- scientifique sans froideur ;
- précis sans surcharge ;
- météo vivante, mais non gadget.

Règles absolues :

- la carte et le radar sont les centres visuels de l’application ;
- les données secondaires accompagnent la carte, elles ne la remplacent pas ;
- les statuts doivent être explicites ;
- aucune donnée fictive ne doit être affichée ;
- aucune source ne doit être présentée comme fonctionnelle si elle ne l’est pas ;
- l’utilisateur doit pouvoir comprendre l’état du système sans lire un diagnostic technique.

À éviter absolument :

- violet flashy ;
- fonds saturés ;
- ombres lourdes ;
- gradients décoratifs ;
- icônes cartoon ;
- boutons trop gros ;
- badges trop nombreux ;
- jargon brut ;
- grandes zones blanches inutiles ;
- empilement vertical excessif ;
- radar rectangulaire dans le Dashboard principal.

---

## 3. Référence Dashboard Radar

L’image `Weather-Garden.png` est la référence visuelle cible du Dashboard Radar.

Elle fixe les éléments suivants :

- header large mais compact ;
- navigation fine et premium ;
- grille en trois colonnes ;
- radar circulaire central dominant ;
- panneaux météo à gauche ;
- panneaux prévision/sources à droite ;
- palette vert jardin, blanc chaud, gris vert ;
- boutons sobres ;
- cartes arrondies ;
- rendu météo local haut de gamme.

Le rendu actuel doit converger vers cette image, pas seulement reprendre l’idée générale.

---

## 4. Palette principale

### 4.1 Couleurs de base

| Usage | Nom | Hex | Règle |
|---|---:|---:|---|
| Fond général | Vert-gris très clair | `#F5F5F0` | Fond de page principal. |
| Surface card | Blanc chaud | `#FFFFFF` | Cards, panneaux, menus. |
| Surface douce | Vert très pâle | `#EAF3ED` | États doux, panneaux secondaires. |
| Surface active | Vert lavé | `#DDEDE4` | Onglet actif, sélection douce. |
| Texte principal | Vert noir | `#1E2420` | Titres, valeurs principales. |
| Texte secondaire | Vert-gris | `#647067` | Sous-titres, aides, dates. |
| Texte discret | Gris vert | `#7C8A80` | Métadonnées, attribution. |
| Bordure | Gris vert clair | `#D9DED7` | Bordures standard. |
| Bordure active | Vert doux | `#BFD3C6` | Hover, focus secondaire. |
| Accent principal | Vert jardin | `#2D6A4F` | Action, état actif, valeur positive. |
| Accent hover | Vert profond | `#24563F` | Hover sur action principale. |

### 4.2 Couleurs sémantiques

| Usage | Hex | Règle |
|---|---:|---|
| Succès / OK | `#2D6A4F` | Source fraîche, action réussie. |
| Info | `#277DA1` | Information météo, source visuelle. |
| Attention | `#F4A261` | Incertitude, donnée ancienne. |
| Danger | `#C1121F` | Alerte forte, erreur visible. |
| Danger sombre | `#8B1E1E` | Urgent uniquement. |
| Désactivé | `#9AA59D` | Source OFF, bouton disabled. |
| Fond info | `#E7F2F7` | Message informatif. |
| Fond attention | `#FFF4DD` | Warning doux. |
| Fond erreur | `#FBEAEC` | Erreur non bloquante. |

### 4.3 Couleurs pluie radar

| Intensité | Couleur | Usage |
|---|---:|---|
| Pluie faible | bleu clair | Petites précipitations. |
| Modérée | vert | Pluie utile / modérée. |
| Forte | orange | Pluie significative. |
| Très forte | rouge sobre | Intensité forte, sans agressivité excessive. |

La palette radar doit rester lisible sur fond cartographique. Les couleurs doivent être suffisamment visibles sans transformer la carte en écran de monitoring agressif.

---

## 5. Typographie

Police obligatoire :

```text
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Aucune police externe n’est nécessaire.

### 5.1 Échelle typographique

| Élément | Desktop large | Desktop | Tablette | Mobile | Poids |
|---|---:|---:|---:|---:|---:|
| Eyebrow app | 15–16 px | 14–15 px | 13–14 px | 12–13 px | 800 |
| Titre app | 52–58 px | 44–52 px | 38–44 px | 34–40 px | 800 |
| Titre section | 22–28 px | 20–24 px | 19–22 px | 18–21 px | 750 |
| Titre card | 17–19 px | 16–18 px | 16–18 px | 16–17 px | 700 |
| Valeur principale | 32–42 px | 28–36 px | 26–32 px | 24–30 px | 800 |
| Valeur secondaire | 17–21 px | 16–20 px | 15–18 px | 15–17 px | 700 |
| Texte courant | 15 px | 14–15 px | 14–15 px | 14–15 px | 400 |
| Label | 12–13 px | 12–13 px | 12–13 px | 12 px | 600 |
| Badge | 11–12 px | 11–12 px | 11–12 px | 11 px | 750 |
| Bouton | 14–15 px | 14–15 px | 14 px | 14 px | 650 |

### 5.2 Règles typographiques

- Les titres principaux peuvent utiliser un letter-spacing négatif léger : `-0.04em` à `-0.06em`.
- Les eyebrows peuvent être en capitales.
- Ne pas mettre des paragraphes entiers en capitales.
- Les valeurs météo importantes doivent être en gras.
- Les labels doivent rester sobres, jamais criards.
- Les unités doivent être lisibles, mais moins dominantes que les valeurs.

---

## 6. Grille générale et supports

## 6.1 Règle structurante

Weather Garden utilise une grille en trois colonnes sur tous les supports, sauf :

- mobile portrait ;
- tablette portrait.

Donc :

- desktop large : trois colonnes ;
- desktop standard : trois colonnes ;
- laptop : trois colonnes ;
- tablette paysage : trois colonnes ;
- mobile paysage : trois colonnes compactes ;
- tablette portrait : une colonne ;
- mobile portrait : une colonne.

Cette règle concerne les écrans principaux de consultation : Dashboard, Radar, Jardin, Alertes, Diagnostic.

### 6.2 Breakpoints recommandés

Les breakpoints doivent être combinés avec l’orientation.

| Support | Condition indicative | Layout |
|---|---|---|
| Mobile portrait | `max-width: 767px` et portrait | 1 colonne |
| Mobile paysage | `max-height: 520px` et landscape | 3 colonnes compactes |
| Tablette portrait | `768px–1023px` et portrait | 1 colonne |
| Tablette paysage | `768px–1199px` et landscape | 3 colonnes compactes |
| Laptop | `1024px–1439px` | 3 colonnes |
| Desktop | `1440px–1799px` | 3 colonnes |
| Desktop large | `1800px+` | 3 colonnes élargies |

### 6.3 Largeur de page

La page ne doit pas être bridée trop fortement.

| Support | Largeur utile |
|---|---:|
| Mobile portrait | 100% moins marges 12–16 px |
| Mobile paysage | 100% moins marges 10–14 px |
| Tablette portrait | 100% moins marges 18–22 px |
| Tablette paysage | 100% moins marges 18–22 px |
| Laptop | 100% moins marges 22–24 px |
| Desktop | 100% moins marges 24–30 px |
| Desktop large | jusqu’à 1600–1760 px, centré si nécessaire |

La largeur maximale ne doit jamais empêcher le radar ou la carte Jardin de respirer sur grand écran.

### 6.4 Colonnes Dashboard

| Support 3 colonnes | Colonne gauche | Centre | Colonne droite | Gap |
|---|---:|---:|---:|---:|
| Mobile paysage | 180–220 px | flexible | 180–220 px | 8–10 px |
| Tablette paysage | 220–260 px | flexible | 220–260 px | 10–12 px |
| Laptop | 260–300 px | flexible | 260–300 px | 12–14 px |
| Desktop | 300–330 px | flexible | 300–330 px | 14–16 px |
| Desktop large | 320–360 px | flexible | 320–360 px | 16–20 px |

Le centre reste prioritaire. Les colonnes latérales doivent se compacter avant de réduire excessivement la carte ou le radar.

---

## 7. Espacements

Unité de base : `4px`.

| Usage | Taille |
|---|---:|
| Micro gap | 4 px |
| Petit gap | 8 px |
| Gap standard | 12 px |
| Gap entre cards | 12–16 px |
| Gap entre colonnes | 12–20 px |
| Padding card compact | 14–16 px |
| Padding card standard | 18–20 px |
| Padding card important | 22–24 px |
| Marge page mobile | 12–16 px |
| Marge page desktop | 24–30 px |

Règle importante : les espacements verticaux doivent rester plus serrés que les espacements horizontaux sur Dashboard, pour éviter de pousser le radar sous le viewport.

---

## 8. Surfaces et cards

### 8.1 Card standard

Style :

- fond `#FFFFFF` ;
- bordure `1px solid #D9DED7` ;
- radius 20–24 px ;
- ombre légère ;
- padding 16–20 px ;
- pas de fond coloré saturé.

Ombre recommandée :

```text
0 12px 30px rgba(27, 38, 32, 0.06)
```

Pour les cards compactes, réduire à :

```text
0 8px 20px rgba(27, 38, 32, 0.045)
```

### 8.2 États de card

| État | Rendu |
|---|---|
| Normal | Bordure gris vert, fond blanc. |
| Hover | Bordure légèrement plus verte, fond très subtilement vert. |
| Active | Bordure vert jardin, fond vert très pâle. |
| Warning | Bordure orange douce, fond jaune pâle. |
| Error | Bordure rouge sobre, fond rouge pâle. |
| Disabled | Opacité 60%, pas d’effet décoratif. |

### 8.3 Radius

| Élément | Radius |
|---|---:|
| Page panels / grandes cards | 22–24 px |
| Cards secondaires | 16–20 px |
| Tuiles internes | 12–14 px |
| Boutons | 999 px ou 14–18 px selon forme |
| Radar circulaire | 50% strict |
| Badges | 999 px |
| Champs | 12–14 px |

Ne pas utiliser `999px` pour les conteneurs larges si cela donne un rendu mou ou enfantin. Réserver `999px` aux boutons pills et badges.

---

## 9. Header global

### 9.1 Composition

Le header contient :

- eyebrow `MÉTÉO + JARDIN` ;
- titre `Weather Garden` ;
- localisation ;
- navigation ;
- statut prochaine mise à jour ;
- actions discrètes éventuelles.

### 9.2 Règles desktop

- Le header doit être compact verticalement.
- La navigation ne doit pas flotter trop bas au centre de la page.
- Aucun grand vide vertical ne doit apparaître entre le titre et la grille principale.
- Le badge de mise à jour reste en haut à droite, discret.
- Les boutons d’action globaux restent petits et premium.

### 9.3 Règles portrait mobile/tablette

- Le titre peut descendre à 34–44 px.
- La navigation passe sous le titre.
- Le badge de mise à jour peut passer sous la localisation ou être aligné à droite si la place le permet.
- Aucun élément ne doit provoquer de scroll horizontal.

---

## 10. Navigation principale

Onglets :

- Dashboard ;
- Jardin ;
- Alertes ;
- Diagnostic.

Style :

- conteneur blanc chaud ;
- bordure douce ;
- hauteur compacte ;
- onglet actif en vert jardin ;
- radius modéré ;
- pas de gros boutons génériques.

Règles :

- la navigation doit être lisible mais ne pas dominer ;
- elle doit consommer peu de hauteur ;
- elle ne doit jamais pousser le radar sous le viewport ;
- en mobile portrait, elle peut scroller horizontalement si nécessaire, mais sans masquer le contenu.

---

## 11. Boutons

### 11.1 Bouton primaire

Usage : action principale claire.

Style :

- fond `#2D6A4F` ;
- texte blanc ;
- radius pill ;
- hauteur minimale 40–44 px ;
- padding horizontal 16–22 px ;
- poids 650.

### 11.2 Bouton secondaire

Usage : action courante non destructive.

Style :

- fond blanc ;
- bordure `#D9DED7` ;
- texte `#1E2420` ;
- hover `#EAF3ED` ;
- radius 14–999 px selon contexte.

### 11.3 Bouton compact radar

Usage : contrôles du radar.

Style :

- hauteur 36–40 px desktop ;
- hauteur 34–38 px compact ;
- padding horizontal 12–16 px ;
- texte court ;
- icône possible ;
- jamais massif.

### 11.4 Bouton danger

Usage : suppression, reset, action irréversible.

Style :

- fond blanc ;
- texte rouge sobre ;
- bordure rouge pâle ;
- pas de gros bouton rouge plein sauf confirmation finale.

---

## 12. Badges et statuts

### 12.1 Badges source

Sources radar :

- `WGR` ;
- `MF` ;
- `RV`.

Règles :

- les badges sont sélectionnables ;
- le mode actif est clairement visible ;
- ils restent compacts ;
- ils ne doivent pas ajouter une grande ligne verticale ;
- `RV` ne doit pas être présenté comme fallback si l’utilisateur l’a choisi explicitement.

### 12.2 Badges fraîcheur

| État | Label | Couleur |
|---|---|---|
| Fresh | OK / Radar frais | Vert |
| Stale | Ancien | Orange doux |
| Unavailable | Indisponible | Gris ou rouge sobre |
| Fallback réel | Fallback | Orange doux |
| Désactivé | OFF | Gris |

### 12.3 Règle anti-surcharge

Un même bloc ne doit pas afficher trop de badges. Si plus de quatre informations techniques sont nécessaires, les déplacer vers Diagnostic ou Sources météo.

---

## 13. Dashboard météo — structure cible

### 13.1 Desktop, laptop, tablette paysage, mobile paysage

Structure obligatoire en trois colonnes :

```text
┌───────────────┬───────────────────────────────┬───────────────┐
│ Synthèse      │ Radar circulaire               │ Prochaine pluie│
│ Conditions    │ Weather Garden Radar           │ Aperçu 2h       │
│ Alertes       │ Légende + statut compact       │ Sources         │
└───────────────┴───────────────────────────────┴───────────────┘
```

### 13.2 Mobile portrait et tablette portrait

Structure en une colonne :

1. Header compact ;
2. Navigation ;
3. Synthèse immédiate ;
4. Radar circulaire complet ;
5. Prochaine pluie ;
6. Conditions actuelles ;
7. Aperçu 2h ;
8. Alertes ;
9. Sources ;
10. Comparatif des prévisions.

---

## 14. Weather Garden Radar

Le Dashboard Radar est l’écran prioritaire de cette charte.

### 14.1 Règle absolue de visibilité

Sur desktop et supports en trois colonnes, à l’ouverture de la page, sans scroll vertical, l’utilisateur doit voir :

- le header compact ;
- la navigation ;
- les trois colonnes ;
- le radar circulaire complet ;
- la légende radar ;
- les principaux panneaux latéraux.

Le comparatif des prévisions peut commencer sous le viewport. Le radar ne doit jamais être coupé.

### 14.2 Diamètre du radar

Le diamètre du radar doit être limité par la hauteur disponible, pas seulement par la largeur.

Formule conceptuelle :

```text
radarDiameter = min(
  largeurCentreDisponible,
  hauteurViewportRestante - headerRadar - légende - statut - marges
)
```

Cibles indicatives :

| Support | Diamètre recommandé |
|---|---:|
| Mobile paysage | 260–340 px |
| Tablette paysage | 380–520 px |
| Laptop 1366×768 | 430–520 px |
| Desktop 1600×900 | 560–650 px |
| Desktop large | 640–760 px |

Si le radar dépasse verticalement, il faut réduire le diamètre, pas demander à l’utilisateur de scroller.

### 14.3 Cercle radar

Le radar doit être un cercle réel :

- masque `border-radius: 50%` ;
- overflow hidden ;
- carte Leaflet visible dans le cercle ;
- anneaux de distance ;
- marqueur local ;
- pluie visible dans toutes les directions.

Interdit : simple carte rectangulaire dans une grande card.

### 14.4 Anneaux de distance

Les anneaux doivent être :

- discrets ;
- lisibles ;
- non militaires ;
- alignés sur le rayon actuel ;
- utiles pour lire la proximité pluie.

Labels recommandés selon rayon :

- rayon 40 km : 10 / 20 / 40 km ;
- rayon 80 km : 20 / 40 / 80 km ;
- rayon 120 km : 20 / 40 / 80 / 120 km ;
- rayon 200 km : 50 / 100 / 150 / 200 km.

### 14.5 En-tête radar

L’en-tête radar doit rester compact.

Contenu recommandé :

- eyebrow : `OBSERVATOIRE MÉTÉO LOCAL` ;
- titre : `Weather Garden Radar` ;
- narration courte ;
- contrôles à droite : `WGR`, `MF`, `RV`, `Zoom auto`, `Actualiser`, `Couches`.

La narration doit être humaine :

- `Aucune pluie proche` ;
- `Pluie faible détectée à 18 km` ;
- `Averse active au sud-ouest` ;
- `Image radar ancienne` ;
- `Météo-France indisponible` ;
- `RainViewer affiché`.

Pas de debug brut dans le Dashboard.

### 14.6 Légende radar

La légende doit être visible sans scroll avec le radar.

Règles :

- compacte ;
- sous le cercle ;
- en ligne quand la largeur le permet ;
- en deux lignes maximum sur supports compacts ;
- jamais séparée du radar par une grande marge.

### 14.7 Statut zoom auto

Le statut zoom auto doit être compact.

Texte cible :

```text
Zoom auto · radar centré jardin
```

Sous-texte éventuel :

```text
Rayon ajusté selon la pluie la plus proche.
```

Le statut ne doit pas créer une grosse barre qui pousse le comparatif ou coupe le radar.

---

## 15. Zoom radar automatique

### 15.1 Principe

Le zoom auto doit montrer la pluie utile la plus proche.

Règles :

- si aucune pluie n’est détectée, afficher large ;
- si la pluie est loin, garder un rayon régional ;
- si la pluie approche, resserrer progressivement ;
- si la pluie est proche, centrer sur le jardin avec un rayon réduit ;
- éviter les changements brutaux entre deux refreshs.

### 15.2 Rayons indicatifs

| Situation | Rayon |
|---|---:|
| Aucune pluie détectée | 160–250 km |
| Pluie lointaine | 120–160 km |
| Pluie moyenne distance | 80–120 km |
| Pluie proche | 40–80 km |
| Pluie très proche | 20–40 km |

### 15.3 Affichage utilisateur

Le rayon actuel doit être visible, mais discret :

```text
Rayon 40 km
```

Le contrôle détaillé peut rester dans le panneau `Contrôle radar` ou dans le menu `Couches`.

---

## 16. Colonne gauche Dashboard

### 16.1 Synthèse météo immédiate

Objectif : réponse immédiate.

Contenu :

- titre `Synthèse météo immédiate` ;
- état principal : `Pluie en cours`, `Pluie possible`, `Pas de pluie proche` ;
- valeur clé : `dans 108 min`, `En cours`, `Aucune pluie proche` ;
- détails compacts : Intensité, Risque, Durée, Source.

Règles :

- la valeur principale domine ;
- la card reste compacte ;
- les lignes internes ne doivent pas ressembler à de gros boutons ;
- éviter les badges techniques inutiles.

### 16.2 Conditions actuelles

Contenu :

- température ;
- humidité ;
- vent moyen ;
- rafales ;
- pluie 1h ;
- pression.

Règles :

- grille 2 colonnes ;
- tuiles compactes ;
- labels secondaires ;
- valeurs en gras ;
- source Ecowitt visible avec fraîcheur.

### 16.3 Alertes actives

L’état vide doit être rassurant :

```text
Aucune alerte météo ou jardin
Tout est calme pour le moment.
```

La card ne doit pas consommer trop de hauteur.

---

## 17. Colonne droite Dashboard

### 17.1 Prochaine pluie prévue

Contenu :

- titre ;
- valeur principale : `108 min`, `En cours`, `Non prévue` ;
- fenêtre horaire ;
- score/probabilité ;
- intensité max ;
- cumul ;
- confiance.

Règles :

- proche du mockup ;
- table compacte ;
- valeur principale dominante ;
- pas de pavés trop hauts.

### 17.2 Aperçu pluie 2h

Le rendu cible est un mini-graphe, pas une liste textuelle lourde.

Règles :

- hauteur compacte ;
- axe temporel lisible ;
- barres ou ligne simple ;
- indication de l’arrivée estimée ;
- pas de chart complexe.

### 17.3 Sources météo

Sources principales :

- Station locale ;
- Prévision AROME ;
- MET Norway ;
- Radar Météo-France ;
- RainViewer.

Règles :

- liste compacte ;
- fraîcheur visible ;
- badge état à droite ;
- pas de longs messages techniques ;
- détails complets dans Diagnostic.

---

## 18. Comparatif des prévisions

Le comparatif est important, mais il ne doit pas concurrencer le radar dans le premier écran.

Règles :

- il peut commencer sous le viewport ;
- il doit être visuellement cohérent avec le Dashboard ;
- il doit conserver un fond calme ;
- WGF doit rester identifié ;
- les icônes météo doivent rester sobres.

Le comparatif ne doit jamais forcer le radar à être tronqué.

---

## 19. Onglet Jardin

L’onglet Jardin utilise aussi la règle de supports : trois colonnes partout sauf mobile portrait et tablette portrait.

### 19.1 Layout trois colonnes

Structure cible :

```text
┌───────────────┬───────────────────────────────┬───────────────┐
│ Entités       │ Carte Jardin                   │ Détail         │
│ Recherche     │ KML / zones / station          │ Édition        │
│ Filtres       │ Toolbar carte                  │ Alertes        │
└───────────────┴───────────────────────────────┴───────────────┘
```

Cette règle remplace l’ancien principe où le détail était forcément sous la carte sur desktop. Pour harmoniser toute l’application, le Jardin adopte aussi une logique trois colonnes dès que le support n’est pas en portrait mobile/tablette.

### 19.2 Mobile portrait et tablette portrait

Ordre :

1. Header Jardin ;
2. Actions principales ;
3. Carte Jardin ;
4. Entités ;
5. Détail / édition.

La carte doit rester immédiatement visible.

### 19.3 Couleurs d’entités Jardin

| Type | Couleur | Hex |
|---|---:|---:|
| Zone générale | Vert sauge | `#588157` |
| Potager | Vert feuille | `#4F8F45` |
| Vigne | Violet raisin sobre | `#7D4E8A` |
| Arbre | Vert forêt | `#386641` |
| Plante | Vert tendre | `#74A57F` |
| Serre | Orange terre cuite | `#D99027` |
| Station météo | Bleu météo | `#277DA1` |
| Capteur | Bleu-gris | `#5A7D8A` |
| Eau / réserve | Bleu clair | `#3A86A8` |
| Compost | Brun doux | `#8D6E4F` |
| Autre | Gris vert | `#7C8A80` |

Les couleurs identifient les entités, elles ne décorent pas l’interface.

### 19.4 Carte Jardin

Règles :

- carte dédiée, séparée du radar ;
- fond Leaflet neutre ;
- polygones semi-transparents ;
- sélection visible ;
- attribution toujours visible ;
- toolbar métier compacte ;
- import/export KML visibles ;
- aucune entité invisible à cause d’un style.

---

## 20. Onglet Alertes

L’onglet Alertes doit rester sobre.

### 20.1 Structure trois colonnes hors portrait

```text
┌───────────────┬───────────────────────────────┬───────────────┐
│ Filtres       │ Liste alertes                  │ Détail / règle │
│ Résumé        │ Alertes météo + jardin         │ Source / cause │
└───────────────┴───────────────────────────────┴───────────────┘
```

### 20.2 États d’alerte

| Niveau | Label | Couleur | Ton |
|---|---|---:|---|
| info | Conseil | Bleu doux | Informatif |
| watch | Surveillance recommandée | Orange doux | Prudent |
| risk | Action conseillée | Rouge sobre | Clair |
| urgent | Action rapide conseillée | Rouge sombre | Direct, non paniquant |

Les alertes doivent toujours expliquer :

- la source ;
- la donnée utilisée ;
- le seuil ou la situation ;
- l’action recommandée.

---

## 21. Onglet Diagnostic

Le Diagnostic peut être plus technique, mais doit rester lisible.

### 21.1 Structure trois colonnes hors portrait

```text
┌───────────────┬───────────────────────────────┬───────────────┐
│ Sources       │ Détails source sélectionnée    │ Actions debug  │
│ États         │ Payload public / fraîcheur     │ Tests locaux   │
└───────────────┴───────────────────────────────┴───────────────┘
```

### 21.2 Règles

- aucun secret affiché ;
- statuts publics nettoyés ;
- erreurs compréhensibles ;
- debug détaillé mais non brutal ;
- liens ou commandes de test regroupés ;
- ne pas polluer le Dashboard avec ces informations.

---

## 22. Responsive détaillé

### 22.1 Desktop large

Objectif : utiliser la largeur.

Règles :

- trois colonnes confortables ;
- radar ou carte très dominant ;
- colonnes latérales complètes ;
- pas de largeur bridée à 1180 px ;
- marges généreuses mais non excessives.

### 22.2 Desktop standard

Objectif : tout voir sans scroll inutile.

Règles :

- trois colonnes ;
- cards compactes ;
- radar dimensionné par hauteur ;
- header compact ;
- comparatif sous le premier écran si nécessaire.

### 22.3 Laptop 1366×768

C’est un viewport critique.

Règle d’acceptation Dashboard :

- radar complet visible sans scroll ;
- légende visible ;
- header visible ;
- navigation visible ;
- colonnes latérales visibles au moins en partie utile.

À faire :

- réduire diamètre radar ;
- compacter header radar ;
- réduire padding cards ;
- éviter les badges trop hauts.

### 22.4 Tablette paysage

Layout : trois colonnes compactes.

Règles :

- colonnes latérales plus étroites ;
- textes raccourcis ;
- contrôles radar sur deux lignes si nécessaire ;
- radar complet visible dans son bloc ;
- pas de scroll horizontal.

### 22.5 Tablette portrait

Layout : une colonne.

Règles :

- synthèse avant radar ;
- radar complet ;
- panels sous le radar ;
- pas de cartes trop hautes ;
- boutons tactiles 44 px.

### 22.6 Mobile paysage

Layout : trois colonnes ultra-compactes.

Règles :

- header très compact ;
- colonnes latérales en mode résumé ;
- radar central réduit mais entier ;
- contrôles très compacts ;
- pas de longs paragraphes ;
- pas de scroll horizontal.

Sur mobile paysage, l’objectif est la consultation rapide, pas l’affichage complet de tous les détails.

### 22.7 Mobile portrait

Layout : une colonne.

Règles :

- header compact ;
- navigation utilisable ;
- synthèse immédiate visible ;
- radar complet dans son bloc ;
- panels empilés ;
- aucun débordement horizontal ;
- boutons tactiles ;
- textes non coupés.

---

## 23. Cartes Leaflet

### 23.1 Règles communes

- attribution visible ;
- contrôles zoom accessibles ;
- marqueur local visible ;
- fond cartographique clair ;
- pas de surcharge de calques ;
- pas de couche affichée si elle est invalide.

### 23.2 Radar vs Jardin

Les deux cartes ne doivent pas être confondues.

| Carte | Usage | Règle |
|---|---|---|
| Radar | Pluie observée / proche | Cercle dans Dashboard. |
| Jardin | Entités, KML, zones | Carte dédiée dans Jardin. |

Ne jamais mélanger carte radar et carte Jardin.

---

## 24. Icônes

Règles :

- style linéaire ou semi-linéaire ;
- sobriété ;
- taille 16–22 px selon contexte ;
- couleur texte secondaire ou accent ;
- pas d’icônes cartoon ;
- pas d’icônes multicolores agressives.

Icônes météo :

- WGF peut avoir un style légèrement plus chaleureux ;
- sources externes doivent rester plus neutres ;
- toujours prévoir fallback incertain / indisponible.

---

## 25. Graphiques

Graphiques autorisés :

- mini bar chart pluie 2h ;
- tendance pluie ;
- comparaison sources ;
- historique court.

Règles :

- axes très discrets ;
- couleurs sobres ;
- pas de graphique décoratif ;
- pas de légende excessive ;
- hauteur compacte dans les panneaux latéraux ;
- version accessible textuelle si nécessaire.

---

## 26. Formulaires

Règles :

- hauteur minimale 44 px sur tactile ;
- radius 12–14 px ;
- bordure douce ;
- labels visibles ;
- erreurs proches du champ ;
- messages clairs ;
- pas de jargon technique ;
- actions principales alignées à droite sur desktop, pleine largeur si mobile portrait.

États obligatoires :

- normal ;
- focus ;
- erreur ;
- disabled ;
- loading ;
- sauvegardé ;
- modifications non enregistrées.

---

## 27. États vides, chargements et erreurs

### 27.1 État vide

Un état vide doit :

- expliquer la situation ;
- proposer une action claire ;
- rester calme ;
- ne pas inventer de données.

### 27.2 Chargement

Le chargement doit être :

- local au bloc concerné ;
- non bloquant si possible ;
- discret ;
- sans popup globale inutile.

### 27.3 Erreur

Une erreur doit indiquer :

- ce qui ne marche pas ;
- si le reste de l’app reste utilisable ;
- quelle source est touchée ;
- si une action utilisateur est possible.

Ne jamais afficher de stack trace brute dans l’UI principale.

---

## 28. Accessibilité

Règles :

- contraste suffisant ;
- focus visible ;
- navigation clavier possible ;
- boutons avec libellés accessibles ;
- icônes non seules si l’action est ambiguë ;
- taille tactile minimale 44 px en portrait ;
- éviter les informations uniquement portées par la couleur.

Les badges couleur doivent être accompagnés d’un texte.

---

## 29. Animations

Animations autorisées :

- transitions douces de hover ;
- apparition légère de panneaux ;
- refresh discret ;
- progression radar si animation temporelle.

Interdit :

- animations permanentes décoratives ;
- pulsations agressives ;
- effets météo gadget ;
- mouvements qui nuisent à la lecture.

Durées recommandées :

- micro interaction : 120–180 ms ;
- transition panneau : 180–240 ms ;
- refresh discret : 240–360 ms.

Respecter `prefers-reduced-motion`.

---

## 30. Densité d’information

Weather Garden doit être précis mais pas dense.

Règles :

- une card = une question principale ;
- un panneau latéral = informations courtes ;
- le détail technique va dans Diagnostic ;
- le Dashboard doit rester narratif ;
- réduire les badges avant de réduire la carte ;
- réduire le texte avant de réduire le radar.

---

## 31. Critères d’acceptation visuelle Dashboard

Un patch Dashboard est acceptable seulement si :

- la page ressemble clairement à `Weather-Garden.png` ;
- le radar est circulaire ;
- le radar est central ;
- le radar complet est visible sans scroll sur desktop ;
- les colonnes latérales accompagnent le radar ;
- la navigation est compacte ;
- les cards sont sobres ;
- les couleurs respectent la palette ;
- les sources météo sont lisibles ;
- aucun scroll horizontal n’apparaît ;
- aucun état source n’est inventé.

Motifs de refus immédiat :

- radar coupé ;
- radar rectangle ;
- besoin de scroller pour voir le radar complet sur desktop ;
- header trop haut ;
- navigation flottante créant un vide ;
- trois colonnes absentes hors portrait ;
- cards latérales trop hautes ;
- données debug dans Dashboard ;
- rendu flashy ;
- largeur artificiellement bridée.

---

## 32. Critères d’acceptation responsive

À vérifier pour chaque patch UI significatif :

- desktop large ;
- desktop 1600×900 ;
- laptop 1366×768 ;
- tablette paysage ;
- tablette portrait ;
- mobile paysage ;
- mobile portrait.

Règle clé :

- trois colonnes partout sauf mobile portrait et tablette portrait ;
- aucune coupure du radar dans son bloc ;
- aucun scroll horizontal ;
- aucun bouton inutilisable ;
- aucune information critique masquée.

---

## 33. Responsabilités de validation

### Marie — UX/UI

- Valider la fidélité à `Weather-Garden.png` ;
- vérifier la hiérarchie ;
- refuser les écrans trop techniques ;
- valider les supports portrait/paysage.

### Aurélie — CSS/UI

- appliquer la charte ;
- garantir les colonnes et la compacité ;
- préserver la palette ;
- éviter les régressions responsive ;
- produire les ajustements visuels fins.

### Sylvain — Frontend JavaScript

- produire le DOM nécessaire ;
- exposer les données sans debug inutile ;
- calculer les dimensions radar si nécessaire ;
- éviter les contrôles morts ;
- préserver la séparation Radar / Jardin.

### Aurélien — Intégration

- découper en patchs courts ;
- refuser les patchs trop larges ;
- exiger captures et validations ;
- vérifier que le contexte courant est la source de vérité.

### QA

- vérifier les viewports ;
- vérifier les états dégradés ;
- vérifier l’absence de scroll horizontal ;
- vérifier que le radar complet reste visible ;
- vérifier que les sources ne mentent pas.

---

## 34. Checklist rapide avant acceptation

- [ ] Palette respectée.
- [ ] Typographie cohérente.
- [ ] Header compact.
- [ ] Navigation compacte.
- [ ] Trois colonnes hors portrait mobile/tablette.
- [ ] Une colonne en mobile portrait.
- [ ] Une colonne en tablette portrait.
- [ ] Radar circulaire.
- [ ] Radar entier visible sans scroll sur desktop.
- [ ] Légende radar visible.
- [ ] Source radar visible.
- [ ] Zoom auto compréhensible.
- [ ] Panneaux latéraux compacts.
- [ ] Aucune donnée fictive.
- [ ] Aucun secret exposé.
- [ ] Aucun scroll horizontal.
- [ ] Aucun rendu flashy.
- [ ] Diagnostic technique hors Dashboard.

---

## 35. Règle finale

Weather Garden doit donner l’impression d’un outil personnel haut de gamme, conçu pour comprendre la météo du jardin en quelques secondes.

La carte, le radar, les sources et les alertes doivent former un ensemble cohérent : local, explicable, sobre, fiable et immédiatement utile.
