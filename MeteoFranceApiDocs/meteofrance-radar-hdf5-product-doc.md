# Meteo-France Radar HDF5 500 m Product

Date de documentation: 2026-05-17.

Sources projet: `src/sources/meteofrance.js`, `test/meteofrance.spec.js`, `test/meteofrance-native-raster.spec.js`, `test/meteofrance-odim-metadata.spec.js`, `test/meteofrance-odim-raw-recovery.spec.js`, fichier local `meteofrance-radar-500.h5`.

Documentation officielle consultee: page officielle des donnees radar Meteo-France.

## 1. Role de la source dans Weather Garden

Le produit HDF5 500 m est le candidat pour le rendu radar Meteo-France natif dans la carte radar Weather Garden. Il doit fournir une couche image georeferencee seulement si toutes les conditions sont confirmees:

- signature HDF5 valide;
- structure parseable;
- dataset radar identifie;
- dimensions attendues;
- projection trouvee;
- bounds trouves;
- valeurs raster lisibles;
- image PNG derivee construite.

## 2. Endpoint officiel utilise

Le lien produit est recupere depuis l'endpoint observation DPRadar, puis filtre par `maille=500`.

Forme observee dans les tests:

```text
https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500
```

Le code ne doit pas conserver les autres query params sensibles potentiels.

## 3. Methode HTTP

`GET`.

## 4. Mode d'authentification

- Header `apikey: <METEOFRANCE_API_KEY>` en mode API Key.
- Header `authorization: Bearer <ACCESS_TOKEN>` en mode OAuth2.

## 5. Headers requis

```http
accept: application/x-hdf5, application/octet-stream, */*
apikey: <METEOFRANCE_API_KEY>
```

ou:

```http
accept: application/x-hdf5, application/octet-stream, */*
authorization: Bearer <ACCESS_TOKEN>
```

## 6. Query parameters connus

- `maille=500`: produit HDF5 primaire.

Autres query params: Non confirmé dans les sources disponibles.

## 7. Exemple de requete anonymise

```bash
curl "https://public-api.meteofrance.fr/public/DPRadar/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=500" \
  -H "accept: application/x-hdf5, application/octet-stream, */*" \
  -H "apikey: <METEOFRANCE_API_KEY>" \
  --output meteofrance-radar-500.h5
```

## 8. Format reel de reponse observe

Tests locaux Vitest mockes et fixtures HDF5 synthetiques:

```http
content-type: application/x-hdf5
content-length: <bytes>
```

Signature attendue:

```text
89 48 44 46 0d 0a 1a 0a
```

Structure utile observee dans les fixtures:

```json
{
  "datasets": [
    {
      "path": "/data1",
      "name": "data1",
      "dimensions": [3472, 3472],
      "dataType": {
        "className": "fixed-point",
        "size": 2
      },
      "storage": {
        "layoutClass": "chunked"
      }
    }
  ],
  "projection": {
    "source": "/where",
    "value": "+proj=stere +lat_0=90 +lon_0=0 +lat_ts=45 +ellps=WGS84"
  },
  "bounds": [[48.1, -1.5], [48.9, -0.7]],
  "quantity": "ACRR",
  "scaleFactor": 0.01,
  "offset": 0,
  "missingValue": 65535,
  "undetectValue": 65534
}
```

Le fichier local `meteofrance-radar-500.h5` existe dans le projet et pese 2 061 568 octets. Son contenu brut n'est pas copie dans cette documentation.

## 9. Champs utiles pour Weather Garden

- `validityTime`: horodatage de frame radar.
- dataset `/data1` ou dataset radar equivalent.
- `dimensions`: attendu `[3472, 3472]` dans le code actuel.
- `quantity`: par exemple `ACRR` dans les fixtures decodables.
- `unit` / `units`: par exemple `centiemes de mm` dans les fixtures.
- `scale_factor` / `gain`: conversion des valeurs brutes.
- `add_offset` / `offset`.
- `missing_value` / `_FillValue` / `nodata`.
- `undetect` / `undetect_value`.
- projection: valeur EPSG ou definition ODIM `/where`.
- bounds geographiques.

Mapping vers Weather Garden:

- `nativeLayer.imageDataUrl`: PNG derive, jamais stocke dans les diagnostics publics HDF5;
- `nativeLayer.bounds`: bounds Leaflet;
- `nativeLayer.frames[]`: frames natives;
- `wgr.frames[]`: sequence radar normalisee;
- `diagnostics.hdf5.nativeLayerCriteria`: preuve de validite.

Sortie native confirmee par les tests:

- `nativeLayer.ok: true`;
- `provider: "meteofrance-radar"`;
- `bounds: [[48.1, -1.5], [48.9, -0.7]]`;
- `sourceWidth: 3472`;
- `sourceHeight: 3472`;
- `width: 868`;
- `height: 868`;
- `frames.length: 1`;
- `frames[0]` reprend les bounds, dimensions raster et attribution;
- `imageDataUrl` est disponible sur la couche native, mais pas dans `diagnostics.hdf5`.

Une seule frame native est suffisante pour un affichage Leaflet fixe. Elle ne justifie pas un controle de lecture/pause cote interface.

## 10. Champs ignores pour l'instant

- HDF5 brut comme source de verite durable.
- Payload complet du fichier HDF5.
- Produit BUFR 1000 m.
- Qualite fine autre que le dataset `quality` resume dans les diagnostics.
- Tous les datasets non identifies comme accumulation radar utilisable.

## 11. Contraintes de fraicheur / frequence / quota si confirmees

Le README projet indique une production toutes les 5 minutes pour le produit national 500 m.

Le Worker impose:

- taille HDF5 maximale diagnostiquee: `40 * 1024 * 1024` octets;
- cache KV diagnostic HDF5: TTL 6 heures;
- taille raster natif maximale: `1024` pixels sur le plus grand cote;
- limite de frames: `24`.

Quotas officiels: Non confirmé dans les sources disponibles.

## 12. Erreurs observees

Tests locaux mockes:

- telechargement retourne HTML `Request Rejected` au lieu de HDF5;
- signature HDF5 invalide;
- HTTP 403 avec URL produit contenant un token;
- structure parseable mais valeurs non decodables;
- projection ou bounds absents;
- dimensions differentes de `3472 x 3472`;
- filtre ou layout HDF5 non supporte.
- attributs ODIM absents du chemin de parsing normal mais recuperables depuis les groupes metadata bruts.

## 13. Cas de fallback

- Si le HDF5 500 m est absent: fallback diagnostic vers `maille=1000`, format `gzip-bufr`, non parse.
- Si le HDF5 500 m existe mais ne produit pas de `nativeLayer.ok`: RainViewer peut rester le fallback visuel.
- Si le fichier est trop grand ou non HDF5: pas de rendu natif.

## 14. Risques ou limites techniques

- Parser HDF5 volontairement limite et "worker-safe"; il ne remplace pas une librairie HDF5 complete.
- Le rendu natif depend de metadata de projection et bounds fiables.
- Une image native approximative ou non georeferencee est interdite par les regles du projet.
- Les URLs produit peuvent etre signees ou tokenisees; elles ne doivent pas etre stockees brutes.
- La palette PNG est produite cote Worker par `METEOFRANCE_RAIN_PALETTE`: bleu/cyan pour pluie faible, bleu dense pour pluie moderee, violet/magenta controle pour pluie forte, rouge sobre pour tres forte pluie. Les couleurs doivent rester lisibles sur fond Leaflet sans aplats agressifs.

## 15. Endpoints Worker Weather Garden lies

- `GET /api/debug/meteofrance/hdf5`
- `GET /api/status`
- `GET /api/public-status`
- `GET /api/refresh`
- `GET /api/debug/rain`

## 16. Tests effectues

Tests locaux Vitest mockes:

- `test/meteofrance.spec.js`: HDF5 minimal parse avec dataset `data1`, `quality1`, projection, bounds et valeurs non decodables.
- `test/meteofrance-native-raster.spec.js`: fixture HDF5 decodable, generation d'un PNG Leaflet, `nativeLayer.ok: true`.
- `test/meteofrance-native-raster.spec.js`: confirme une image native `868 x 868` derivee d'une grille source `3472 x 3472`, `nativeRaster.downsampleFactor: 4`, `nonZeroPixels: 3600`, `rainPixels: 3600`, `minValue: 2.5`, `maxValue: 2.5`.
- `test/meteofrance-odim-metadata.spec.js`: metadata ODIM `/where` et `/what`, avec projection `projdef`, coins geographiques, `quantity: ACRR`, `gain: 0.01`, `offset: 0`, `nodata: 65535`, `undetect: 65534`.
- `test/meteofrance-odim-raw-recovery.spec.js`: recuperation d'attributs ODIM depuis les groupes bruts quand le parsing normal des headers les masque; `structure.recoveredOdimAttributeCount > 0` et `/where` apparait dans `structure.recoveredOdimAttributePaths`.
- Verification de non-fuite: pas de `api-key-token`, pas de token produit, pas de `data:image` dans `diagnostics.hdf5`.

## 17. Points non confirmes

- Schema complet du HDF5 reel actuel Meteo-France.
- Liste exhaustive des datasets radar et qualite.
- Projection officielle stable pour tous les produits.
- Bounds reels nationaux du produit 500 m.
- Unite officielle stable de chaque dataset.
- Comportement complet du produit local `meteofrance-radar-500.h5` au-dela de sa presence et de sa taille, sauf si un diagnostic local explicite confirme `signatureOk`, `parsingOk`, `canDecodeGrid`, `nativeLayerAvailable` et `image.dataUrlAvailable`.

Non confirmé dans les sources disponibles.
