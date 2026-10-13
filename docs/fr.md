# Île-de-France Mobilités

Cette intégration suit **vos transports franciliens en temps réel** dans Gladys : les prochains passages à vos arrêts — **RER, Transilien, métro, tram, bus** — avec leurs **retards** et **suppressions**, et l'**info trafic** de vos lignes (incidents, travaux). Elle les transforme en appareils, en déclencheurs de scène (« mon RER est supprimé », « mon métro passe dans 5 minutes », « la ligne 13 est perturbée ») et en widgets de tableau de bord.

Les données viennent de **PRIM**, la plateforme de données ouvertes d'Île-de-France Mobilités, et de ses référentiels ouverts (lignes et arrêts).

> Intégration communautaire, sans lien avec Île-de-France Mobilités, la SNCF ou la RATP.

## Configuration

### 1. Obtenir une clé d'API (gratuit)

1. Créez un compte sur [prim.iledefrance-mobilites.fr](https://prim.iledefrance-mobilites.fr).
2. Dans le menu de votre compte, ouvrez **Mes jetons d'authentification**, onglet **API**, puis cliquez sur **Générer mon jeton**.
3. Copiez le jeton tout de suite : il n'est **affiché qu'une fois** (en générer un nouveau invalide l'ancien).

Un nouveau compte autorise **1 000 requêtes par jour et par API**. C'est suffisant pour un ou deux arrêts avec une plage horaire. Pour davantage, demandez gratuitement un quota plus élevé sur la page [Ma consommation API](https://prim.iledefrance-mobilites.fr/fr/ma-consommation-api) (jusqu'à 1 000 000 par jour pour les prochains passages), puis reportez le nouveau quota dans le réglage **Quota quotidien des départs**.

### 2. Les arrêts suivis (jusqu'à 3)

| Champ               | Rôle                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| **Arrêt**           | le nom de l'arrêt (« Massy - Palaiseau », « Châtelet ») ou son numéro donné par **Chercher un arrêt**    |
| **Ligne**           | optionnelle mais conseillée : « RER B », « Transilien P », « Métro 13 », « T3a », « Bus 91 », « C01743 » |
| **Direction**       | optionnelle : des mots de la destination (« Robinson », « Saint-Rémy \| Massy » pour deux directions)    |
| **Plage horaire**   | optionnelle, par exemple `07:00-09:30`                                                                   |
| **Jours de trajet** | optionnels, par exemple du lundi au vendredi (vide : tous les jours)                                     |

Pour une ligne, sans mode précisé, une lettre désigne une ligne de train (« B » = RER B, « P » = Transilien P) et un nombre une ligne de métro avant une ligne de bus (« 13 » = métro 13). Pour un bus, écrivez « Bus 91 » ; si plusieurs réseaux ont une ligne du même numéro, utilisez l'identifiant donné par **Chercher une ligne** (« C01122 »).

Avec une ligne, le nom de l'arrêt est cherché **parmi les arrêts de cette ligne** : c'est le plus fiable. Sans ligne, l'intégration prend l'arrêt dont le nom correspond exactement, en privilégiant les gares, et affiche **toutes** ses lignes. Si ce n'est pas le bon arrêt, utilisez **Chercher un arrêt** et copiez son numéro.

#### La plage horaire

Les prochains passages ne sont connus que **deux heures à l'avance**. Avec une plage horaire, l'arrêt n'est lu que d'une heure avant la plage jusqu'à sa fin, et **pas du tout** le reste du temps. Cela économise beaucoup le quota : un arrêt avec une plage de 2 heures du lundi au vendredi coûte environ 65 requêtes par jour, contre environ 600 pour un arrêt lu toute la journée.

Si les arrêts configurés demandent plus que le quota, l'intégration **espace d'elle-même** les lectures (le bouton **Tester la connexion** indique l'intervalle réellement utilisé).

### 3. L'info trafic

Dans **Lignes suivies**, saisissez jusqu'à 6 lignes séparées par des virgules : `RER B, Transilien P, Métro 13`. Tout le réseau est lu en **une seule requête** toutes les 5 minutes (réglable), environ 290 requêtes par jour quel que soit le nombre de lignes.

Une ligne est :

- **interrompue** si une perturbation bloquante est en cours (trafic interrompu sur tout ou partie de la ligne) ;
- **perturbée** si une perturbation est en cours sans interrompre le trafic (ralentissements, arrêts non desservis…) ;
- **normale** sinon. Les simples messages d'information (ascenseur en panne, etc.) ne comptent pas.

Enregistrez, puis cliquez sur **Tester la connexion** : il indique, pour chaque arrêt, le nombre de départs trouvés et l'heure du prochain, l'état de chaque ligne et la consommation du quota.

### 4. Ajouter les appareils

Dans l'onglet **Découverte**, chaque arrêt apparaît comme « IDFM – _arrêt_ (_ligne_ → _direction_) » et chaque ligne suivie comme « IDFM – Trafic _ligne_ ». Ajoutez-les et placez-les dans une pièce.

| Appareil | Fonctionnalité             | Valeur                                                                      |
| -------- | -------------------------- | --------------------------------------------------------------------------- |
| Arrêt    | **Prochain départ**        | texte, par exemple « 07:42 · RER B KASE → Aéroport CDG 2 · +5 min »         |
| Arrêt    | **Départ dans**            | en minutes, temps réel                                                      |
| Arrêt    | **Retard**                 | en minutes (trains avec horaire ; toujours 0 pour le métro, qui n'en a pas) |
| Arrêt    | **Départs perturbés**      | combien de départs suivis sont en retard (au-delà du seuil) ou supprimés    |
| Ligne    | **Trafic**                 | texte : « Trafic normal », « Perturbé : … », « Interrompu : … »             |
| Ligne    | **Perturbations en cours** | nombre de perturbations en cours (hors simples informations)                |

Les noms des appareils et les résumés de scène suivent le réglage **Langue des textes** : anglais, français, allemand, espagnol, ou automatique (la langue de votre tableau de bord, dès qu'un widget IDFM a été affiché).

Sur l'écran **Appareils**, le badge de chaque arrêt et de chaque ligne indique **cloud** tant que l'API PRIM répond, **injoignable** quand sa dernière lecture a échoué, et passe à l'orange quand les lectures sont en pause à cause du quota quotidien.

## Scènes

### Déclencheurs

| Déclencheur                    | Quand                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| **IDFM : train en retard**     | un train suivi prend du retard (à partir du seuil), puis à 15 et 30 min                 |
| **IDFM : départ supprimé**     | un départ suivi est supprimé                                                            |
| **IDFM : départ imminent**     | un départ suivi part dans 2, 5, 10, 15, 20 ou 30 minutes, compté sur l'horaire **réel** |
| **IDFM : ligne perturbée**     | une nouvelle perturbation touche une ligne suivie (filtres : gravité, incident/travaux) |
| **IDFM : retour à la normale** | une ligne suivie qui était perturbée circule de nouveau normalement                     |

Chaque événement fournit une variable **Résumé**, une phrase prête à envoyer : « Massy - Palaiseau : le RER B KASE → Aéroport CDG 2 part dans 15 min, à 07:42 (4 min de retard). » ou « RER B : Interrompu. Trafic interrompu entre Massy et Paris. ».

Un événement n'est déclenché qu'une fois par départ ou par perturbation, même après un redémarrage.

### Actions

- **IDFM : prochains départs** : le prochain départ d'un arrêt (ligne, destination, horaire, retard, voie…) et un résumé, par exemple pour « annoncer mon prochain RER quand je sors de la douche ».
- **IDFM : trafic d'une ligne** : l'état d'une ligne, sa principale perturbation et un résumé.

## Widgets

- **Départs IDFM** : les prochains départs d'un arrêt, comme sur les écrans en gare, avec « dans N min », « +N min », « Supprimé » ou « À quai ». Choisissez un arrêt suivi, ou saisissez un autre arrêt (et sa ligne) directement dans le widget — attention, il consomme alors le quota à chaque rafraîchissement.
- **Trafic IDFM** : l'état de chaque ligne suivie (ou de celles saisies dans le widget), puis les perturbations en cours et celles prévues dans les 24 heures ; touchez-en une pour lire le message complet.

## Questions fréquentes

**Pas de retard pour le métro ?** Le métro et la plupart des bus n'ont pas d'horaire théorique dans les données temps réel : seul le temps d'attente est connu. Le retard et le déclencheur « train en retard » concernent les RER, Transilien et lignes avec horaire.

**Le widget affiche « Départs de 07:00-09:30 affichés à partir de 06:00 ».** C'est normal : hors de la plage horaire, l'arrêt n'est pas lu.

**Noms d'appareils ou résumés en anglais ?** Réglez **Langue des textes** dans les réglages, ou affichez une fois un widget IDFM.

**« La clé d'API PRIM est refusée ».** Le jeton a été mal copié ou régénéré depuis : générez-en un nouveau et collez-le.

**« Quota quotidien atteint ».** Ajoutez une plage horaire à vos arrêts, augmentez le rafraîchissement, ou demandez un quota plus élevé à PRIM (gratuit) et reportez-le dans les réglages.
