// Ejecuta un script con el Python del entorno virtual del proyecto (.venv), en Windows o Unix.
// Uso: node tools/python.mjs <script.py> [argumentos]
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const py = process.platform === 'win32' ? join('.venv', 'Scripts', 'python.exe') : join('.venv', 'bin', 'python');
if (!existsSync(py)) {
  console.error('Falta el entorno de Python. Créalo con:\n  python -m venv .venv\n  .venv/Scripts/python -m pip install -r requirements.txt');
  process.exit(2);
}
const r = spawnSync(py, ['-X', 'utf8', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
