// SOLMAR — Streets of Gold: the entrypoint for the make.fun gta6-01
// contest ("Make GTA 6"). It gathers the playable game and its four
// screenshots into the output folder, then asks the kit's dossier
// builder to describe the whole entry in one deterministic JSON file.
//
// Nothing here touches the network. It only reads the game/ and
// screenshots/ folders sitting next to this file and writes into the
// output directory (MAKEFUN_OUTPUT_DIR, or /output when unset).

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyTreeInto(name: string): void {
  const from = join(repoDir, name);
  const to = join(outDir, name);
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    const src = join(from, entry);
    if (!statSync(src).isFile()) continue;
    cpSync(src, join(to, entry));
  }
}

function copyTreeRecursive(name: string): void {
  // game/ has subfolders (src/), so walk it depth-first; files only.
  const from = join(repoDir, name);
  const to = join(outDir, name);
  if (!existsSync(from)) return;
  const walk = (srcDir: string, dstDir: string): void => {
    mkdirSync(dstDir, { recursive: true });
    for (const entry of readdirSync(srcDir)) {
      const src = join(srcDir, entry);
      const dst = join(dstDir, entry);
      if (statSync(src).isDirectory()) walk(src, dst);
      else if (statSync(src).isFile()) cpSync(src, dst);
    }
  };
  walk(from, to);
}

mkdirSync(outDir, { recursive: true });
copyTreeRecursive('game');
copyTreeInto('screenshots');

const dossier = buildDossier(resolve(outDir), {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});

writeFileSync(join(outDir, 'dossier.json'), dossier);
