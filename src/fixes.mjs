// Retrouver, dans l'historique, les commits qui corrigent un bug.
//
// Chaque correctif est un cas d'échec gratuit : le code d'avant était fautif,
// et le diff montre en quoi. C'est la matière première de Twice Shy.

import { recentCommits } from "./git.mjs";

/**
 * Mots qui, dans un sujet de commit, annoncent une correction.
 *
 * Les premiers viennent des commits conventionnels, qui sont un standard et non
 * l'habitude d'une équipe. Les suivants couvrent ce que les gens écrivent quand
 * ils ne les suivent pas, en anglais et en français. Aucun n'est propre à un
 * projet : c'est ce qui rend l'apprentissage possible dans n'importe quel dépôt.
 * Même liste que `properties.rs` dans Cockpit, plus « fixes », « fixed », « bug ».
 */
const FIX_MARKERS = [
	"fix:",
	"fix(",
	"fix ",
	"fixes ",
	"fixed ",
	"fixing ",
	"hotfix",
	"bugfix",
	"bug:",
	"revert",
	"correctif",
	"corrige",
	"correction",
	"répare",
	"repare",
	"regression",
	"régression",
	"patch:",
];

/** Le sujet ressemble-t-il à une correction ? Le marqueur doit commencer un mot : « prefix » n'est pas « fix ». */
export function looksLikeFix(subject) {
	const lower = subject.toLowerCase();
	return FIX_MARKERS.some((marker) => {
		let at = lower.indexOf(marker);
		while (at !== -1) {
			if (at === 0 || !/[\p{L}\p{N}]/u.test(lower[at - 1])) return true;
			at = lower.indexOf(marker, at + 1);
		}
		return false;
	});
}

/**
 * Fichiers qui ne sont pas du code. Un correctif qui ne touche qu'eux corrige
 * une faute de frappe dans un README ou une version de dépendance : il n'apprend
 * rien sur les bugs du code.
 */
const NOT_CODE = [
	/\.(md|mdx|txt|rst|adoc)$/i,
	/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|composer\.lock|Gemfile\.lock|go\.sum)$/,
	/(^|\/)(CHANGELOG|LICENSE|AUTHORS)[^/]*$/i,
	/\.(png|jpe?g|gif|webp|svg|ico|pdf|lock)$/i,
	/(^|\/)\.github\//,
	/(^|\/)locales?\//,
	/(^|\/)i18n\//,
];

export function isCode(file) {
	return !NOT_CODE.some((pattern) => pattern.test(file));
}

/**
 * Les commits récents qui touchent du code, du plus récent au plus ancien.
 * Un commit qui touche plus de 25 fichiers est un chantier, pas un bug : on l'écarte.
 */
export function codeCommits(root, scan = 400) {
	return recentCommits(root, scan)
		.map((commit) => ({ ...commit, files: commit.files.filter(isCode) }))
		.filter((commit) => commit.files.length > 0 && commit.files.length <= 25)
		.filter((commit) => !(/^revert/i.test(commit.subject) && /merge/i.test(commit.subject)));
}

/** Les correctifs reconnus à leur sujet (`fix:`, `corrige`…), sans appel au modèle. */
export function findFixes(root, { scan = 400, max = 40 } = {}) {
	return codeCommits(root, scan).filter((commit) => looksLikeFix(commit.subject)).slice(0, max);
}

/**
 * Les correctifs, y compris dans un dépôt qui ne les étiquette pas.
 *
 * Beaucoup d'équipes écrivent « Panier : le total ne compte plus deux fois la
 * remise » plutôt que « fix: ». À l'inverse, « fix: changelog » ou « fix lint »
 * ne réparent aucun bug, et un test sur eux mesurerait du bruit. Les mots-clés
 * ne suffisent donc ni dans un sens ni dans l'autre : un modèle rapide lit tous
 * les sujets et désigne ceux qui réparent un vrai bug. Les mots-clés ne servent
 * plus que si le modèle ne répond pas. `classify(commits)` rend les index retenus.
 */
export async function findFixesSmart(root, classify, { scan = 400, max = 40 } = {}) {
	const commits = codeCommits(root, scan);
	let indexes = null;
	try {
		indexes = await classify(commits);
	} catch {
		indexes = null;
	}
	const chosen = indexes
		? new Set(indexes.map((index) => commits[index]?.sha).filter(Boolean))
		: new Set(commits.filter((commit) => looksLikeFix(commit.subject)).map((commit) => commit.sha));
	const fixes = commits.filter((commit) => chosen.has(commit.sha)).slice(0, max);
	return { fixes, scanned: commits.length, classified: indexes !== null };
}

/**
 * Sépare les correctifs en deux : les anciens pour apprendre, les récents pour tester.
 *
 * Sans cette séparation, une règle tirée d'un bug « détecterait » forcément ce
 * même bug, et le score serait truqué. On teste sur des bugs que la règle n'a
 * jamais vus, comme on évalue un modèle sur des données qu'il n'a pas apprises.
 */
export function splitFixes(fixes, { test = 12 } = {}) {
	if (fixes.length < 4) return { learnFrom: fixes, testOn: fixes, leaked: true };
	const count = Math.min(test, Math.floor(fixes.length / 2));
	return { testOn: fixes.slice(0, count), learnFrom: fixes.slice(count), leaked: false };
}
