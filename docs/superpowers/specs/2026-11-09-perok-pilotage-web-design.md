# Perok — pilotage web d'un minidrone Parrot Airborne Night

Document de conception · 2026-11-09

## Intention

Paul possède un **Parrot Airborne Night « Maclane »** de 2015. L'application
officielle qui le pilotait, *FreeFlight Mini*, a disparu du Play Store. Le drone
est donc inutilisable alors que le matériel fonctionne parfaitement.

L'objectif est de **repiloter ce drone depuis son téléphone** (Samsung Galaxy
S25), de façon durable, sans dépendre d'un magasin d'applications ni d'un
serveur allumé quelque part.

### Pourquoi les pistes évidentes sont écartées

**Réinstaller l'APK d'origine : impossible.** La dernière version publiée est
FreeFlight Mini 5.5.9 (février 2019, paquet `com.parrot.freeflight4mini`). Elle
n'embarque que des bibliothèques natives 32 bits — `armeabi`, `armeabi-v7a`,
`x86` — et **aucun `arm64-v8a`**. Le Galaxy S25 tourne sur Snapdragon 8 Elite
(cœurs Oryon, ARMv9.2-A, 64 bits), qui n'exécute pas de code ARM 32 bits.
L'installation échoue donc par absence d'ABI compatible, et non à cause d'un
`targetSdk` trop ancien. Rafistoler l'APK supposerait de recompiler l'ARSDK3 de
Parrot en arm64 puis de réinjecter les `.so` : lourd, fragile, et inutile.

**Reprendre l'app native : non retenu.** Un binaire Android rejoue
indéfiniment le problème qui a tué l'original — ABI, `targetSdk`, resideload à
chaque évolution d'Android.

### Ce qu'un spike a déjà prouvé

Un spike jetable, parti du projet communautaire
[web-bluetooth-parrot-drone](https://github.com/poshaughnessy/web-bluetooth-parrot-drone)
(écrit pour le Rolling Spider), a établi des faits qui dé-risquent entièrement
le projet :

- le drone est vivant et émet en BLE sous un nom de la forme
  **`Maclan_` suivi de six chiffres** — noter l'absence du « e » : Parrot
  tronque le nom annoncé, et un filtre `Maclane_` ne matche rien ;
- une **page web a connecté le drone et l'a fait décoller** ;
- l'Airborne Night expose donc **les mêmes services GATT que le Rolling
  Spider** : le protocole BLE est commun à la gamme des minidrones.

Le verrou technique principal est levé avant la première ligne du projet.

## Objectifs

1. Une application web **installable (PWA)**, ouverte depuis l'écran d'accueil
   du téléphone, qui pilote le drone en Bluetooth basse consommation.

2. **Trois schémas de commande au choix de l'utilisateur** — décision de Paul,
   qui a préféré les implémenter tous les trois plutôt que d'en élire un :
   - **deux joysticks virtuels** — gauche : altitude et lacet ; droite :
     tangage et roulis (disposition d'une radiocommande classique) ;
   - **un joystick + boutons** — manche pour la direction, boutons maintenus
     pour monter, descendre et pivoter ;
   - **joystick + inclinaison** — l'inclinaison physique de l'appareil dirige,
     le manche gère altitude et lacet.

   **Ordre de livraison, décidé par Paul : les deux joysticks d'abord**, seuls,
   dans la première version volable. Les deux autres modes sont des incréments
   ultérieurs. Motif : les zones mortes et les courbes de réponse ne peuvent se
   régler qu'en vol réel, et il faut les régler **une fois** avant de les
   reporter sur les autres modes. Le mode par défaut est donc « deux
   joysticks ».

3. Les fonctions, par ordre de priorité **fixé par Paul** :
   - **P1** — décollage, atterrissage, coupure d'urgence, niveau de batterie,
     état de vol ;
   - **P2** — loopings, réglages d'altitude / d'inclinaison / de vitesse
     maximales, *flat trim* (recalibrage de l'horizontale) ;
   - **P3** — **déclenchement de photo** ;
   - **P4** — **LED du Night**, exploratoire et sans garantie de résultat.

   P3 et P4 ont été **interverties par rapport à la demande initiale**, après
   lecture de la spécification ARSDK (voir plus bas) : déclencher une photo est
   documenté et bon marché, alors qu'aucune commande LED n'est documentée pour
   le Night.

### À quoi ressemble la réussite

Paul sort dans un parc sans réseau, ouvre l'icône sur son écran d'accueil,
appuie sur Connect, décolle, pilote, et **repose le drone au sol en douceur**.

## Non-objectifs

- **Retour vidéo en direct.** Le matériel ne le permet pas : la caméra
  verticale est un capteur VGA 480 × 640 qui écrit des photos dans 1 Go de
  mémoire flash embarquée. Il n'existe aucun flux. Le FPV live était réservé au
  Mambo FPV, au Jumping Sumo et au Bebop. Point explicitement accepté par Paul.
- **Rapatrier les photos dans l'application.** Le déclenchement est dans le
  périmètre (P3), le téléchargement non : aucune commande de transfert de
  fichier n'existe dans le jeu de commandes BLE des minidrones. Les images
  restent dans la mémoire du drone.
- Ressusciter ou modifier l'APK FreeFlight Mini.
- Publier sur un magasin d'applications.
- Piloter plusieurs drones, ou d'autres modèles Parrot. Le protocole étant
  commun à la gamme, il ne faut pas *fermer* cette porte, mais ne rien
  construire pour elle.
- Prendre en charge iOS ou Firefox : ils n'implémentent pas Web Bluetooth.

## Anti-objectifs

Ce qui ferait échouer le projet même s'il « fonctionne » techniquement :

- **Un pilotage saccadé.** Le spike envoyait des rafales de quarante pas par
  clic ; on ne peut pas poser un drone comme ça. Si le dosage n'est pas continu
  et progressif, le projet a raté sa cible.
- **Ne pas pouvoir reprendre la main.** Formulation issue de la décision de
  Paul sur l'arrêt d'urgence (ci-dessous) : la voie réflexe est **« Atterrir »,
  un seul appui, toujours visible**. La coupure moteur, elle, est un acte
  violent — le drone tombe sur place — et se mérite par un **glissement de
  confirmation**. L'échec serait qu'aucune des deux ne soit atteignable, pas que
  la plus brutale soit protégée.
- **Dépendre de quoi que ce soit pour voler** : ni laptop, ni serveur, ni
  réseau, une fois l'application installée.
- **Une chaîne d'outils qui ne compile plus dans deux ans.** C'est précisément
  ce qui a tué l'application d'origine.

## Contraintes

- **Web Bluetooth** exige un contexte sécurisé : HTTPS, ou `localhost`.
  Disponible sur Chrome / Edge / Samsung Internet sur Android. Sur Chrome
  Linux, l'API est cachée derrière
  `chrome://flags/#enable-experimental-web-platform-features` et le groupe de
  travail classe Linux « partiel / non supporté » — le développement local est
  possible (le spike l'a fait) mais **la validation se fait sur le téléphone**.
- **Distribution : GitHub Pages**, sur un **dépôt public** (décision de Paul).
  Pages sur dépôt privé exigerait un plan payant. Le serveur ne sert qu'à
  installer et mettre à jour : une fois la PWA ajoutée à l'écran d'accueil, son
  service worker la rend autonome.
- **TypeScript compilé par `tsc` seul**, en modules ES, **sans bundler**
  (décision de Paul). Motif : le typage protège un code qui manipule des
  tampons d'octets et des compteurs de séquence, où une erreur se paie par un
  drone qui part de travers sans message d'erreur ; l'absence de bundler
  protège la longévité du projet.
- Dépôt `perok`, **branche d'intégration `master`** (et non `main`), qui est
  aussi la branche source du déploiement.
- Le BLE est à faible débit : la boucle de commande doit rester modeste.
- Portée radio d'environ 20 mètres ; autonomie d'environ 9 minutes.
- Le drone **s'éteint seul après quelques minutes d'inactivité** : le parcours
  de reconnexion n'est pas un cas marginal, c'est un cas courant.

## Connaissances protocolaires déjà établies

À ne pas redécouvrir.

### Couche BLE (vérifiée par le spike)

- Les UUID suivent le motif **`9a66XXXX-0800-9191-11e4-012d1540cb8e`**, où
  `XXXX` est le segment court cité ci-dessous.
- Services : **`fa00`** (écritures sans réponse, les commandes), **`fb00`**
  (notifications), `fc00` (écriture `ffc1`, non utilisé), **`fd21`** et
  **`fd51`** (lecture/écriture/notification), `fe00` (non utilisé).
- Caractéristiques utiles : **`fa0a`** (consignes de pilotage), **`fa0b`**
  (commandes : décollage, atterrissage, urgence, looping), **`fa0c`**,
  **`fb0e`** (état de vol), **`fb0f`** (batterie).
- Chaque caractéristique d'écriture porte **son propre compteur de séquence**,
  incrémenté à chaque envoi.
- États de vol, dans cet ordre : `fsLanded`, `fsTakingOff`, `fsHovering`,
  `fsUnknown`, `fsLanding`, `fsCutOff`. L'octet d'index 6 de la notification
  `fb0e` porte l'état.
- La notification `fb0f` porte le niveau de batterie dans son dernier octet.
- `requestDevice` doit déclarer les services dans `optionalServices`, sinon
  l'accès GATT est refusé après connexion.
- Préfixes de nom à filtrer : **`Maclan_`** (le modèle de Paul), plus `RS_`,
  `Mars_`, `Travis_`, `Mambo_`, `Blaze_`, `Swat_`, `Swing_`.

### Couche commandes (spécification officielle Parrot)

Le fichier **`xml/minidrone.xml`** du dépôt
[Parrot-Developers/arsdk-xml](https://github.com/Parrot-Developers/arsdk-xml)
décrit le jeu de commandes complet des minidrones. **Il a été supprimé du
`master`** (le dépôt a été modernisé pour la génération Anafi) mais reste
récupérable dans l'historique :

```
https://raw.githubusercontent.com/Parrot-Developers/arsdk-xml/acbd609ba4af0534b39a486c93e06c5c05b3b976/xml/minidrone.xml
```

Une copie de référence est déposée dans `.arsdk-ref/minidrone.xml` (hors suivi
Git). Classes déclarées : `Piloting`, `PilotingState`, `Animations`,
`MediaRecord`, `MediaRecordState`, `MediaRecordEvent`, `PilotingSettings`,
`PilotingSettingsState`, `SpeedSettings`, `SpeedSettingsState`, `Settings`,
`SettingsState`, `FloodControlState`, `GPS`, `Configuration`,
`UsbAccessoryState`, `UsbAccessory`, `RemoteController`, `NavigationDataState`,
`MinicamState`, `VideoSettings`, `VideoSettingsState`, `Minicam`,
`RemoteControllerState`.

Conséquences directes sur l'estimation :

- **P2 est du câblage, pas de la rétro-ingénierie.** `MaxAltitude` et `MaxTilt`
  sont dans `PilotingSettings`, `MaxVerticalSpeed` et `MaxRotationSpeed` dans
  `SpeedSettings`, `FlatTrim` dans `Piloting`, `Flip` dans `Animations`. Chacune
  a sa commande d'état miroir (`…State`) pour lire la valeur courante.
- **P3 (déclenchement photo) est documenté** : `MediaRecord.Picture` et
  `MediaRecord.PictureV2`, avec les retours `MediaRecordState.PictureStateChanged`,
  `PictureStateChangedV2`, l'événement `MediaRecordEvent.PictureEventChanged` et
  `MinicamState.PictureChanged`.
- **P4 (LED) reste une inconnue.** Aucune commande LED n'existe pour le Night
  dans cette spécification ; la seule piste est `UsbAccessory.LightControl`,
  documentée comme « USB Light control cmd », donc destinée à la lampe
  accessoire du Cargo. Il faudra déterminer si les LED du Night y répondent, si
  elles sont pilotées autrement, ou si elles sont purement matérielles.

## Architecture — les parties décidées

Le découpage en couches **est mon choix de conception**, pas une demande de
Paul. La décision structurante qu'il porte :

> **Les quatre axes normalisés sont la seule interface entre les commandes et
> le reste de l'application.**

Chaque schéma de commande ne produit qu'un objet `{ pitch, roll, yaw, gaz }`,
chaque valeur dans `-100..100`. Tout ce qui est en aval ignore d'où viennent ces
nombres. C'est ce qui rend les trois modes abordables : la boucle d'envoi, le
modèle du drone et le transport sont écrits une fois, et un mode supplémentaire
ne coûte qu'un module d'entrée.

1. **Transport** — connexion BLE, GATT, cache des services et caractéristiques,
   compteurs de séquence, écriture de commandes, décodage des notifications.
   Ne connaît rien au pilotage.
2. **Modèle du drone** — état observable (état de vol, batterie, connexion) et
   actions nommées : décoller, atterrir, couper, looping, réglages, flat trim,
   photo.
3. **Boucle de commande** — émetteur à intervalle fixe qui envoie l'état
   courant des quatre axes. C'est la pièce qui remplace les rafales du spike et
   rend le dosage continu.
4. **Entrées** — les schémas de commande, interchangeables, normalisant vers
   les quatre axes.
5. **Interface** — bandeau d'état (connexion, batterie, état de vol),
   « Atterrir » en un appui, coupure moteur par glissement, et un écran de
   réglages pour le mode de commande et les limites P2.

L'ordre d'implémentation commence par le transport et la boucle de commande :
rien d'autre n'est observable sans elles.

## Décisions que j'ai prises moi-même

À vérifier par Paul s'il le souhaite, mais elles ne lui ont pas été soumises.

- **Cadence de la boucle : 50 ms, émission continue y compris à consignes
  nulles**, comme le font les implémentations de référence. Le drone attend un
  flux, pas des impulsions. La valeur doit être exposée comme paramètre
  réglable, au même titre que les zones mortes.
- **Dépendances : `typescript` et rien d'autre.** Les tests utilisent le
  lanceur intégré à Node, sans linter. Cohérent avec l'anti-objectif sur la
  chaîne d'outils. Les couches testables sans drone — encodage des trames,
  compteurs de séquence, décodage des notifications, normalisation des axes —
  sont justement celles où une erreur coûte cher.
- **Persistance des réglages : `localStorage`.**
- **Déploiement : une GitHub Action**, pour que le dépôt ne contienne pas de
  code généré.
- **Livraison des builds de développement : déployer sur Pages dès le premier
  jour**, éventuellement depuis une branche de préversion. C'est le seul moyen
  simple d'obtenir un contexte sécurisé sur le téléphone, et ça évite un
  tunnel ou un `adb reverse`.
- **Mode inclinaison (incrément ultérieur) : référence calibrée à l'armement**,
  téléphone tenu naturellement, et ±30° correspondant à 100 %. Un référentiel
  horizontal absolu rendrait le mode injouable.

## Ce qui est laissé au constructeur

- La structure DOM et CSS, et l'implémentation des joysticks (événements
  pointeur, multi-touch, suivi du doigt hors de la zone).
- Les valeurs de zone morte et les courbes de réponse : réglables seulement en
  vol réel. Prévoir qu'elles soient faciles à ajuster.
- La stratégie précise de mise en cache du service worker.
- Le détail du `tsconfig` et l'arborescence de sortie.
- Le parcours d'erreur et de reconnexion, sachant que la déconnexion est un cas
  courant et non exceptionnel.
- Le maintien de l'écran allumé pendant le vol (Screen Wake Lock) et le
  verrouillage en orientation paysage.
- La mécanique exacte du glissement de confirmation de la coupure moteur.

## Risques

- **P4, les LED : faisabilité non établie.** Aucune commande documentée. À
  borner dans le temps : si la piste `UsbAccessory.LightControl` ne répond pas,
  on abandonne sans que le projet en souffre.
- **La boucle de développement sur Linux n'est pas supportée** par Chromium en
  amont. Elle a fonctionné pour le spike, mais toute validation passe par le
  téléphone. Les sorties de vol étant forcément groupées, les questions à
  trancher en vol doivent être réunies par lots plutôt que traitées une à une.
- **Sécurité physique.** Les auteurs du projet de référence préviennent que
  leur code n'est pas blindé et recommandent de garder un moyen de couper le
  drone — présenter un carton rigide par-dessous suffit, le drone détecte le
  contact et s'arrête. À reprendre dans l'interface : alerte sous 10 % de
  batterie (le code de référence le fait déjà).
- **Dépendance au navigateur.** Si Chrome retirait Web Bluetooth, l'application
  mourrait comme son ancêtre. Risque accepté : l'API est déployée depuis dix
  ans et le code métier resterait réutilisable.

## Héritage du spike

Le spike vit dans `spike/web-bluetooth-parrot-drone/` : code tiers cloné, puis
rustiné (filtres de nom corrigés, bandeau de diagnostic à l'écran, service
worker désactivé). **Il est jetable et ne doit pas être la base du projet.** Ce
qu'il faut en extraire, c'est la connaissance protocolaire consignée plus haut
— pas les fichiers.
