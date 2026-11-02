# Administration locale Guild Wars Reborn

Depuis la **racine** du projet :

```bash
python tools/admin-server.py
```

Ouvrir http://127.0.0.1:8765/admin/ (ne pas ouvrir `admin/index.html` en `file://`).

1. Choisir un lieu dans la liste, ou cliquer sur **+ Nouveau**.
2. Cliquer sur **Placer par clic** puis sur la carte pour renseigner X/Y.
3. Compléter les champs et cliquer sur **Appliquer à la liste**.
4. Cliquer sur **Enregistrer le CSV**. Une copie horodatée est créée dans `data/source/backups/`.
5. Cliquer sur **Générer les JSON**. La génération réutilise `tools/build-data.py`, sans `--force`.

Les lignes incomplètes (dont Shing Jea Arena) doivent être corrigées avant l'enregistrement. Les IDs vides sont générés par `build-data.py` lors de la génération. Après génération, recharger l'administration pour récupérer les nouveaux IDs depuis le CSV.

Le serveur est limité à `127.0.0.1` et ne doit pas être déployé sur un hébergement public. Faire un commit Git avant les premières modifications. Ne pas exposer `data/source/backups/` sur un site public.
