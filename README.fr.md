# Twice Shy

**Chat échaudé craint l'eau froide.** Ton agent ne refera pas une erreur que ton projet a déjà payée.

*[English](README.md) · Français*

Twice Shy est un plugin pour [Claude Code](https://docs.claude.com/en/docs/claude-code). Il apprend ce que ton
projet attend du code à trois endroits : **les bugs déjà corrigés, les corrections que tu répètes à tes agents, et
les décisions que tu as écrites** (ADR, `CLAUDE.md`). Il teste chaque règle avant de la garder. Ensuite, chaque fois
que l'agent dit « fini », il lance tes vérifications et ces règles sur la modification, et renvoie l'agent tant que
ça ne passe pas.

<p align="center"><img src="docs/demo.gif" alt="Twice Shy apprend des règles à partir des bugs, des corrections et des décisions, puis renvoie l'agent tant que sa modification ne les respecte pas" width="820"></p>
<p align="center"><sub>Sur un petit dépôt de démonstration. Les sorties de Twice Shy et l'ADR écrit par l'agent sont réels ; le bug
d'arrondi a été tapé à la main, car sur un dépôt aussi petit l'agent a trouvé la bonne solution tout seul.</sub></p>

## Pourquoi

La semaine dernière, tu as dit à l'agent « passe par le service, pas par fetch ». L'agent d'aujourd'hui n'en sait
rien. Ton `CLAUDE.md` dit « montants en centimes » ; rien ne le vérifie. Un ADR explique pourquoi tu as choisi une
bibliothèque ; l'agent en ajoute une autre pour le même besoin, et personne n'écrit pourquoi.

Les agents repartent de zéro à chaque session. Twice Shy, c'est la mémoire qui vérifie.

## D'où viennent les règles

| Source | Ce qu'elle lit | Une règle est gardée si… |
|---|---|---|
| **Tes bugs passés** | Les correctifs de tes 400 derniers commits | elle aurait détecté au moins un bug récent qu'elle n'avait jamais vu |
| **Tes corrections** | Tes messages dans les sessions Claude Code passées de ce projet (« non, fais plutôt comme ça ») | elle ne signale pas de code sain |
| **Tes décisions** | Les ADR, `CLAUDE.md`, `AGENTS.md`, et les documents que tu déclares | le code la suit encore ; sinon elle est signalée comme **périmée** |

Les sources sont des modules (`src/sources/`) : en ajouter une, par exemple les commentaires de revue des pull
requests, ne touche pas au reste.

Toutes les règles, quelle que soit leur source, passent le même examen :

- sur des **correctifs récents qu'elles n'ont jamais vus** : auraient-elles signalé le code d'avant le correctif ?
  (bug détecté)
- sur des **commits récents et sains** : les signaleraient-elles quand même ? (fausse alerte)

Une règle tirée des bugs doit faire ses preuves ; une règle que tu as demandée doit seulement ne pas bloquer du code
sain ; une décision écrite que les commits récents ne suivent plus n'est pas imposée mais signalée, parce que c'est
peut-être le document qui a tort.

## Est-ce que ça marche ?

Règles apprises sur les correctifs anciens, testées sur les plus récents, qu'elles n'avaient jamais vus :

| Dépôt | Langage | Bugs récents que les règles gardées auraient détectés |
|---|---|---|
| [spf13/cobra](https://github.com/spf13/cobra) | Go | 3 à 5 sur 12, selon le passage |
| [pallets/click](https://github.com/pallets/click) | Python | 2 sur 12 |

Sur un projet jeune, l'historique est maigre : un projet de 22 commits n'a donné aucune règle tirée des bugs, mais
14 règles tirées des corrections de son auteur et de son `CLAUDE.md`. C'est pour ça qu'il y a plusieurs sources.

Les chiffres varient d'un passage à l'autre : le juge est un modèle de langage, et chaque score est affiché pour que
tu le voies.

## À chaque arrêt de l'agent

1. Rien n'a changé depuis la dernière vérification réussie : l'agent s'arrête, rien n'est lancé.
2. Les vérifications du projet (types, lint, tests) tournent, détectées par sous-projet (`server/`, `web/`,
   `packages/*`), et seulement pour les sous-projets que la modification touche.
3. Un juge lit les lignes modifiées au regard des règles qui concernent les fichiers touchés.
4. **L'agent a ajouté une dépendance** et le dépôt a un dossier d'ADR : il doit écrire l'ADR (pourquoi cette
   bibliothèque, et pourquoi pas ce que le projet utilise déjà) avant de pouvoir s'arrêter.
5. Un échec : l'agent est renvoyé avec la sortie, la ligne, et l'origine de la règle (« vient de l'ADR-0004 », ou
   tes propres mots). Il corrige.
6. Trois échecs de suite, ou un agent qui s'arrête sans rien avoir changé : Twice Shy le laisse s'arrêter et te dit
   en une ligne ce qui reste en échec. Il ne tourne jamais en boucle.

## Installation

Il faut [Claude Code](https://docs.claude.com/en/docs/claude-code), `git` et Node.js 18 ou plus.

```
/plugin marketplace add jodevweb/twiceshy
/plugin install twiceshy@twiceshy
```

Redémarre Claude Code, ouvre ton projet, puis :

```
/twiceshy:learn
```

À partir de là, chaque fois que l'agent s'arrête, Twice Shy vérifie son travail. Commite `.twiceshy/rules.json` :
toute l'équipe a les mêmes règles.

## Commandes

| Commande | Ce qu'elle fait |
|---|---|
| `/twiceshy:learn` | Apprend des règles à partir de tes bugs, de tes corrections et de tes décisions, et les teste. Deux ou trois minutes. |
| `/twiceshy:status` | Les règles par source, leur score, les décisions périmées, et les vérifications lancées à chaque arrêt. |
| `/twiceshy:check` | Vérifie les modifications en cours tout de suite, sans attendre que l'agent s'arrête. |
| `/twiceshy:adr` | Liste tes ADR et ceux que le code ne suit plus. `/twiceshy:adr init` crée `docs/adr/` avec un modèle. |

Les mêmes commandes marchent hors de Claude Code : `node <dossier du plugin>/bin/twiceshy.mjs learn|status|check|adr`.

## Langages

Les règles sont jugées sur des diffs : elles marchent pour tous les langages. Les vérifications sont détectées
d'après les fichiers du projet, à la racine et dans les sous-projets :

| Stack | Vérifications détectées |
|---|---|
| Node / TypeScript | scripts `typecheck`, `lint`, `test` (npm, pnpm, yarn, bun) |
| Python | `ruff`, `mypy` s'ils sont configurés, `pytest` (uv, poetry) ou `manage.py test` pour Django |
| Go | `go vet ./...`, `go test ./...` |
| Rust | `cargo test` |
| PHP | `composer test`, `php artisan test`, `phpunit` |
| Java / Kotlin | Maven, Gradle |
| Ruby, Elixir | `rspec`, `mix test` |

Les nouvelles dépendances sont repérées dans `package.json`, `composer.json`, `requirements*.txt`,
`pyproject.toml`, `go.mod`, `Cargo.toml` et `Gemfile`.

## Configuration

Facultative. `.twiceshy/config.json` :

```json
{
  "gates": ["pnpm typecheck", { "command": "pytest -q", "dir": "server" }],
  "documents": ["docs/conventions.md", "CONTRIBUTING.md"],
  "sources": { "corrections": false },
  "adr": "auto",
  "model": "sonnet",
  "maxAttempts": 3,
  "gateTimeoutSeconds": 300,
  "enabled": true
}
```

- `gates` remplace les vérifications détectées. Une vérification avec un `dir` tourne dans ce dossier, seulement
  quand la modification le touche.
- `documents` ajoute tes propres règles écrites à la source des décisions.
- `sources` coupe une source.
- `adr` : `"auto"` exige un ADR pour une nouvelle dépendance si le dépôt a un dossier d'ADR ; `true` toujours ;
  `false` jamais.
- `enabled: false` coupe le hook pour ce dépôt sans rien désinstaller.

## Coût et confidentialité

Twice Shy n'a ni serveur ni clé API. Il appelle le `claude` déjà connecté sur ta machine, avec une consigne courte et
sans tes réglages globaux, tes skills ni tes serveurs MCP, ce qui rend chaque appel peu coûteux. Avec un abonnement
Claude, c'est compris dans ton usage ; `learn` affiche ce que le passage coûterait au tarif de l'API.

Il lit tes sessions Claude Code passées **de ce projet et de ses worktrees git seulement**, sur ta machine, et envoie des extraits de tes
messages au même Claude que tu utilises déjà. Pour le couper : `"sources": { "corrections": false }`.

## Limites

- Le juge est un modèle de langage : il peut se tromper. C'est pour ça que les règles sont testées avant d'être
  gardées, et que les scores sont affichés.
- Une règle tirée de tes corrections peut décrire une préférence qui ne valait qu'une fois. Elle est supprimée si
  elle signale du code sain ; sinon, retire-la de `.twiceshy/rules.json`.
- Si tes tests échouaient déjà avant que l'agent commence, Twice Shy arrête de bloquer dès que l'agent s'arrête sans
  rien changer, et te prévient.

## Feuille de route

- D'autres sources : les commentaires de revue des pull requests, les lignes que tu réécris à la main après un agent.
- Une GitHub Action qui fait la même chose sur chaque pull request.

## Licence

MIT
