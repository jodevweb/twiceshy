// Source : tes corrections aux agents, dans les sessions Claude Code passées.
//
// Un projet jeune n'a pas encore de bugs à montrer, mais il a déjà des
// « non, pas comme ça ». Un modèle rapide les repère parmi tes messages, puis
// un second en tire des règles vérifiables sur un diff.

import { t } from "../i18n.mjs";
import { CORRECTION_RULES_SCHEMA, PICK_SCHEMA, correctionRulesPrompt, pickCorrectionsPrompt } from "../prompts.mjs";
import { readSessions } from "./sessions-reader.mjs";

export default {
	id: "corrections",
	policy: "requested",
	title: () => t("sectionCorrections"),
	label: () => t("labelCorrections"),
	async collect({ root, model, ask }) {
		const messages = readSessions(root);
		if (messages.length === 0) return { notes: [t("noSessions")], rules: [] };
		const sessions = new Set(messages.map((m) => m.session)).size;
		const picked = await ask({ prompt: pickCorrectionsPrompt(messages), schema: PICK_SCHEMA, cwd: root, model: "haiku" });
		const corrections = (picked.picked ?? []).map((index) => messages[index]).filter(Boolean);
		const notes = [`${t("sessionsRead", { count: messages.length, sessions })}, ${t("correctionsFound", { count: corrections.length })}`];
		if (corrections.length === 0) return { notes, rules: [] };
		const data = await ask({
			prompt: correctionRulesPrompt(corrections.slice(0, 80)),
			schema: CORRECTION_RULES_SCHEMA,
			cwd: root,
			model,
			tools: "Read,Grep,Glob",
			timeoutMs: 10 * 60_000,
		});
		const rules = (data.rules ?? []).slice(0, 6).map(({ occurrences, quote, ...rule }) => ({
			...rule,
			origin: { occurrences: Math.max(1, Number(occurrences) || 1), quote: String(quote ?? "").slice(0, 200) },
		}));
		return { notes, rules };
	},
};
