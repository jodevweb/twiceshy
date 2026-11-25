// Le hook `Stop` de Claude Code : l'agent dit « fini », Twice Shy vérifie.
//
// Claude Code envoie sur l'entrée standard un JSON (`session_id`, `cwd`…). Pour
// renvoyer l'agent au travail, le hook écrit `{"decision":"block","reason":…}` :
// la raison est ce que l'agent lit. Pour laisser passer, il n'écrit rien, ou un
// `systemMessage` d'une ligne pour l'humain.
//
// Garde-fous :
// - le juge est lui-même une session Claude : `TWICESHY_JUDGE` coupe le hook
//   dans ce cas, sinon chaque juge en relancerait un autre ;
// - un diff déjà validé ne se revérifie pas : une question sans modification de
//   code ne relance pas les tests ;
// - au bout de `maxAttempts` renvois, ou si l'agent s'arrête sans avoir rien
//   changé depuis le dernier renvoi, on le laisse s'arrêter et on prévient
//   l'humain. Un test déjà cassé avant lui ne doit pas le faire tourner en rond.

import { repoRoot } from "./git.mjs";
import { agentReport, checkRepo, failed, shortProblems } from "./check.mjs";
import { t } from "./i18n.mjs";
import { readConfig, readState, writeState } from "./store.mjs";

function readStdin() {
	return new Promise((resolve) => {
		if (process.stdin.isTTY) return resolve("");
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => (data += chunk));
		process.stdin.on("end", () => resolve(data));
	});
}

const emit = (value) => process.stdout.write(JSON.stringify(value) + "\n");

export async function stopHook() {
	if (process.env.TWICESHY_JUDGE) return;
	let input = {};
	try {
		input = JSON.parse((await readStdin()) || "{}");
	} catch {
		// Une entrée illisible : on vérifie quand même le dossier courant.
	}
	const root = repoRoot(input.cwd || process.cwd());
	if (!root) return;
	const config = readConfig(root);
	if (config.enabled === false) return;

	const state = readState(root);
	const sessionId = input.session_id || "manual";
	state.sessions ??= {};
	const session = (state.sessions[sessionId] ??= { attempts: 0 });

	const result = await checkRepo(root);
	if (result.skipped || result.hash === state.passedHash) return;

	const save = () => {
		// On ne garde que les vingt dernières sessions : l'état n'est pas un journal.
		const ids = Object.keys(state.sessions);
		for (const id of ids.slice(0, Math.max(0, ids.length - 20))) delete state.sessions[id];
		writeState(root, state);
	};

	if (!failed(result)) {
		state.passedHash = result.hash;
		session.attempts = 0;
		save();
		const message = result.judgeError
			? t("judgeFailed", { error: result.judgeError })
			: t("passed", { gates: result.gates.length, rules: result.rulesChecked });
		emit({ systemMessage: message });
		return;
	}

	const stuck = session.lastBlockedHash === result.hash;
	if (stuck || session.attempts >= config.maxAttempts) {
		const count = session.attempts;
		session.attempts = 0;
		session.lastBlockedHash = null;
		save();
		emit({ systemMessage: t("giveUp", { count, problems: shortProblems(result) }) });
		return;
	}

	session.attempts++;
	session.lastBlockedHash = result.hash;
	save();
	emit({ decision: "block", reason: agentReport(result) });
}
