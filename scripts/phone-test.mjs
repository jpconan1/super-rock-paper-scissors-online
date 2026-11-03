import { networkInterfaces } from 'node:os';
import { spawnSync } from 'node:child_process';

const addresses = Object.values(networkInterfaces()).flat().filter((entry) =>
  entry && entry.family === 'IPv4' && !entry.internal &&
  /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address));
const address = process.argv[2] ?? addresses[0]?.address;
if (!address || !/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
  console.error('No local network address found. Pass your computer IP: npm run phone-test -- 192.168.1.10');
  process.exit(1);
}

const origin = `http://${address}:8787`;
console.log(`Building game for ${origin}`);
const build = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit', env: { ...process.env, VITE_SERVER_URL: origin },
});
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`\nOpen ${origin} on phones connected to the same Wi-Fi.`);
console.log('If it cannot connect, allow incoming connections for Node/Wrangler in your computer firewall.');
const worker = spawnSync('npx', ['wrangler', 'dev', '--ip', '0.0.0.0', '--port', '8787',
  '--var', `ALLOWED_ORIGINS:${origin}`], { stdio: 'inherit' });
process.exit(worker.status ?? 1);
