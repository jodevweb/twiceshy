// Ce que Twice Shy demande à git. Tout passe par ici, pour qu'une seule fonction
// sache lancer git et rendre sa sortie, quelle que soit la plateforme.

import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Lance git dans `cwd`. Rend la sortie, ou `null` si git a échoué. */
export function git(cwd, args, { maxBuffer = 64 * 1024 * 1024 } = {}) {
	const run = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer, windowsHide: true });
	if (run.error || run.status !== 0) return null;
	return run.stdout;
}

/** La racine du dépôt qui contient `cwd`, ou `null` hors d'un dépôt. */
export function repoRoot(cwd) {
	const out = git(cwd, ["rev-parse", "--show-toplevel"]);
	return out ? out.trim() : null;
}

/** Le dossier `.git` réel (un worktree a le sien ailleurs). */
export function gitDir(root) {
	const out = git(root, ["rev-parse", "--absolute-git-dir"]);
	return out ? out.trim() : join(root, ".git");
}

/** Le dépôt a-t-il au moins un commit ? Un dépôt neuf n'a pas de HEAD. */
export function hasHead(root) {
	return git(root, ["rev-parse", "--verify", "--quiet", "HEAD"]) !== null;
}

/** Un fichier non suivi au-delà de cette taille n'entre pas dans le diff : c'est un binaire, un export, un log. */
const MAX_UNTRACKED_BYTES = 200_000;

/**
 * Ce qui a changé dans le dépôt par rapport au dernier commit, suivi ou non.
 *
 * Un agent crée souvent des fichiers sans les ajouter à git : les oublier,
 * ce serait ne juger que la moitié de son travail.
 */
export function workingChange(root) {
	const head = hasHead(root);
	const tracked = head ? (git(root, ["diff", "--no-color", "--no-ext-diff", "HEAD"]) ?? "") : "";
	const files = new Set(
		(head ? (git(root, ["diff", "--name-only", "HEAD"]) ?? "") : "")
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	);

	let untracked = "";
	const others = (git(root, ["ls-files", "--others", "--exclude-standard"]) ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	for (const file of others) {
		try {
			const path = join(root, file);
			if (statSync(path).size > MAX_UNTRACKED_BYTES) continue;
			const content = readFileSync(path, "utf8");
			if (content.includes("\u0000")) continue;
			files.add(file);
			const lines = content.split("\n");
			untracked += `diff --git a/${file} b/${file}\nnew file\n--- /dev/null\n+++ b/${file}\n@@ -0,0 +1,${lines.length} @@\n`;
			untracked += lines.map((line) => `+${line}`).join("\n") + "\n";
		} catch {
			// Un fichier qui disparaît entre la liste et la lecture n'est plus un changement.
		}
	}

	return { diff: tracked + untracked, files: [...files] };
}

/**
 * Les commits récents, sans les fusions : `{ sha, subject, body, date, files }`.
 * Un seul appel à git pour tout l'historique : un appel par commit coûterait
 * plusieurs secondes sous Windows.
 */
export function recentCommits(root, limit = 400) {
	const out = git(root, ["log", `-${limit}`, "--no-merges", "--name-only", "--format=%x1e%H%x1f%s%x1f%cs%x1f%b%x1f"]);
	if (!out) return [];
	return out
		.split("\u001e")
		.filter((chunk) => chunk.trim())
		.map((chunk) => {
			const [sha, subject, date, body, rest] = chunk.split("\u001f");
			const files = (rest ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
			return { sha: sha.trim(), subject: subject ?? "", date: date ?? "", body: (body ?? "").trim(), files };
		});
}

/** Le diff d'un commit, borné : un correctif de 3 000 lignes n'apprend rien de plus qu'un extrait. */
export function commitDiff(root, sha, maxChars = 15_000) {
	const out = git(root, ["show", "--no-color", "--no-ext-diff", "--format=%s%n", sha]) ?? "";
	return out.length > maxChars ? out.slice(0, maxChars) + "\n[… diff tronqué]\n" : out;
}
