# Guild Wars Codex Studio

Depuis la racine du projet, créer la base locale si elle n'existe pas :

```bash
python tools/sqlite/init-db.py
```

Puis lancer le Studio :

```bash
python tools/admin-server.py
```

Ouvrir http://127.0.0.1:8765/admin/.

1. Choisir un lieu dans la liste ou cliquer sur **+ Nouveau**.
2. Cliquer sur **Placer par clic**, puis sur la carte pour renseigner les coordonnées.
3. Compléter les champs, puis cliquer sur **Appliquer à la liste** pour continuer à éditer.
4. Cliquer sur **Enregistrer** pour sauvegarder la liste dans SQLite. Une sauvegarde de l'état précédent est créée dans `_backup/studio/`.

5. Cliquer sur **Générer la carte locale** pour actualiser les JSON à partir des données enregistrées dans SQLite. Recharger la carte à l'adresse http://127.0.0.1:8765/.

Le Studio crée les identifiants vides à l'enregistrement. Le CSV est conservé comme référence de migration.

## Restaurer une sauvegarde

Arrêter le serveur du Studio et conserver une copie de la base actuelle. Depuis la racine du projet, remplacer la base par la sauvegarde choisie dans `_backup/studio/`. Exemple avec la sauvegarde initiale :

```powershell
Copy-Item -LiteralPath 'data/db/guildwarscodex.db' -Destination '_backup/studio/before-restore.db'
Copy-Item -LiteralPath '_backup/studio/before-sqlite-studio.db' -Destination 'data/db/guildwarscodex.db' -Force
```

Relancer le Studio et générer la carte pour que les JSON reflètent la base restaurée.

Pour vérifier la parité du CSV avec la base de départ, avant toute saisie :

```bash
python tools/sqlite/check-parity.py
```

Le serveur d'édition est destiné à un usage local sur `127.0.0.1`.
