// L'affichage dans le terminal : quelques couleurs, rien de plus.
//
// Les commandes tournent souvent sous Claude Code, qui relit leur sortie : sans
// terminal, pas de couleurs, pour ne pas lui faire lire des codes d'échappement.

const useColor = process.stdout.isTTY && !process.env.NO_COLOR || Boolean(process.env.FORCE_COLOR);

const wrap = (open, close) => (text) => (useColor ? `\u001b[${open}m${text}\u001b[${close}m` : String(text));

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
export const magenta = wrap(35, 39);

export const log = (line = "") => process.stdout.write(line + "\n");

/** Une étape en cours, puis son résultat sur la même ligne quand c'est possible. */
export function step(label) {
	const started = Date.now();
	if (useColor) process.stdout.write(`${cyan("›")} ${label}…`);
	else log(`› ${label}…`);
	return (result = "") => {
		const seconds = ((Date.now() - started) / 1000).toFixed(0);
		if (useColor) process.stdout.write(`\r\u001b[2K${green("✓")} ${label}${result ? dim(" · " + result) : ""} ${dim(seconds + "s")}\n`);
		else log(`✓ ${label}${result ? " · " + result : ""} (${seconds}s)`);
	};
}
