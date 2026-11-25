// Les sources de règles.
//
// Une source dit où trouver ce que le projet attend du code, et comment en
// tirer des règles. Elle ne décide pas si ses règles sont bonnes : toutes
// passent le même examen dans `learn.mjs` (bugs récents jamais vus, commits
// récents sains). Ajouter une source, c'est écrire un module de plus ici et
// l'ajouter à la liste ; rien d'autre ne change.
//
// Le contrat d'une source :
//
//   {
//     id: "bugs",                   // nom stable, aussi utilisé dans la config
//     policy: "proven",             // ce que ses règles doivent prouver (voir plus bas)
//     title: () => "…",             // titre de sa section dans le bilan
//     label: () => "…",             // la même chose en minuscules, dans la phrase du bilan
//     async collect(ctx) {          // rend { notes: [lignes], rules: [{ text, scope, why, origin }] }
//     },
//   }
//
// `ctx` : `{ root, config, model, ask(options) → data, history }`, où
// `history` porte les correctifs et les commits sains, lus une seule fois.
// `origin` est ce que la règle garde de sa source (une citation, un document…).
//
// Les politiques :
// - `proven` : la règle doit avoir détecté au moins un bug jamais vu. C'est le
//   cas des règles que Twice Shy invente lui-même : rien d'autre ne les justifie.
// - `requested` : quelqu'un l'a demandée ; elle doit seulement ne pas bloquer
//   du code sain.
// - `documented` : une décision écrite ; si le code récent ne la suit plus,
//   elle n'est pas imposée mais signalée comme périmée.
//
// Une source se coupe dans `.twiceshy/config.json` : `"sources": { "corrections": false }`.

import bugs from "./bugs.mjs";
import corrections from "./corrections.mjs";
import decisions from "./decisions.mjs";

export const SOURCES = [bugs, corrections, decisions];

export const enabledSources = (config) => SOURCES.filter((source) => config.sources?.[source.id] !== false);
