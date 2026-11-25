// Fabrique docs/demo.gif à partir d'un scénario (scenario.json) et de terminal.html.
//
//   node docs/demo/capture.mjs <playwright-module-path> [fps]
//
// Chaque image est rendue à un instant précis (renderAt(t)), puis ffmpeg les
// assemble avec une palette calculée sur l'ensemble : pas de dépendance au
// rythme réel de la machine pendant la capture.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [playwrightPath, fpsArg] = process.argv.slice(2);
const fps = Number(fpsArg ?? 12);
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const script = JSON.parse(readFileSync(join(here, "scenario.json"), "utf8"));
const duration = Math.max(...script.map((e) => e.at + (e.type === "type" ? e.text.length / (e.speed || 28) : 0))) + 3.5;

const frames = join(here, "frames");
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 720 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "terminal.html")).href);
await page.evaluate((s) => (window.SCRIPT = s), script);
const total = Math.ceil(duration * fps);
for (let i = 0; i < total; i++) {
	await page.evaluate((t) => window.renderAt(t), i / fps);
	await page.screenshot({ path: join(frames, `f${String(i).padStart(5, "0")}.png`) });
}
await browser.close();

const out = join(here, "..", "demo.gif");
const palette = join(frames, "palette.png");
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "f%05d.png"), "-vf", "palettegen=max_colors=128:stats_mode=full", palette]);
execFileSync("ffmpeg", [
	"-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "f%05d.png"), "-i", palette,
	"-lavfi", "scale=960:-1:flags=lanczos [x]; [x][1:v] paletteuse=dither=sierra2_4a", "-loop", "0", out,
]);
execFileSync("ffmpeg", [
	"-y", "-loglevel", "error", "-framerate", String(fps), "-i", join(frames, "f%05d.png"),
	"-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", join(here, "..", "demo.mp4"),
]);
rmSync(frames, { recursive: true, force: true });
console.log(`${total} images, ${duration.toFixed(1)} s → ${out}`);
