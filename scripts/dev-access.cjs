const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const localJava = path.join(root, '.local', 'tools', 'java21');
const javaBin = fs.existsSync(localJava) && fs.readdirSync(localJava)
  .map(name => path.join(localJava, name, 'bin'))
  .find(bin => fs.existsSync(path.join(bin, process.platform === 'win32' ? 'java.exe' : 'java')));
const env = { ...process.env };
if (javaBin) {
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = [javaBin, env[pathKey]].filter(Boolean).join(path.delimiter);
}

const args = ['emulators:exec', '--project', 'demo-wallet-access', '--only', 'auth,firestore', 'node scripts/serve.cjs --dev-access'];
const cliLocation = path.join(root, '.local', 'firebase-cli-path.txt');
const cached = fs.existsSync(cliLocation) ? path.join(fs.readFileSync(cliLocation, 'utf8').trim(), 'lib', 'bin', 'firebase.js') : '';
const command = cached && fs.existsSync(cached) ? [cached, ...args] :
  [process.env.npm_execpath, 'exec', '--yes', '--package=firebase-tools@15.34.2', '--', 'firebase', ...args];
const result = spawnSync(process.execPath, command, { cwd: root, env, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;