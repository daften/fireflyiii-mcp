#!/usr/bin/env node
// Snapshots Firefly III's REST route table for one release, for the tool contract test
// (src/tests/firefly-contract.test.ts). Only HTTP methods and path templates are recorded.
//
// Usage: node scripts/update-firefly-routes.mjs <tag>     e.g. node scripts/update-firefly-routes.mjs v6.7.7
// Writes:  src/tests/fixtures/firefly-routes-<tag>.json
//
// Firefly declares every API route in routes/api.php as one flat Route::group per resource, each
// with a single 'prefix'. This reads that file: the prefix line, then each Route::<method>('<path>').
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseRoutes(php) {
  const routes = new Set();
  let prefix = '';
  let pendingMethod = null; // a Route::<method>( whose path is on the next line
  for (const line of php.split('\n')) {
    if (/^\s*\/\//.test(line)) continue; // commented-out routes do not exist
    const p = line.match(/'prefix'\s*=>\s*'([^']*)'/);
    if (p) prefix = p[1];
    const sameLine = line.match(/Route::(get|post|put|patch|delete)\(\s*'([^']*)'/);
    const openOnly = line.match(/Route::(get|post|put|patch|delete)\(\s*$/);
    const pathOnly = pendingMethod ? line.match(/^\s*'([^']*)'/) : null;
    let method;
    let path;
    if (sameLine) [, method, path] = sameLine;
    else if (pathOnly) [method, path] = [pendingMethod, pathOnly[1]];
    pendingMethod = openOnly ? openOnly[1] : null;
    if (!method) continue;
    const full = `/${[prefix, path].filter(Boolean).join('/')}`.replace(/\/+$/, '');
    if (!full.startsWith('/v1/')) continue;
    // Name every path parameter `{}`: only the shape matters for matching.
    routes.add(`${method.toUpperCase()} ${full.replace(/\{[^}]+\}/g, '{}')}`);
  }
  return [...routes].sort();
}

async function main() {
  const tag = process.argv[2];
  if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    console.error('Usage: node scripts/update-firefly-routes.mjs vX.Y.Z');
    process.exit(1);
  }
  const source = `https://raw.githubusercontent.com/firefly-iii/firefly-iii/${tag}/routes/api.php`;
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GET ${source} returned HTTP ${response.status}`);
  const routes = parseRoutes(await response.text());
  if (routes.length < 100) throw new Error(`Only ${routes.length} routes parsed from ${source}; refusing to write.`);
  const out = resolve(dirname(fileURLToPath(import.meta.url)), `../src/tests/fixtures/firefly-routes-${tag}.json`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ firefly: tag, source, routes }, null, 2)}\n`);
  console.log(`Wrote ${routes.length} routes to ${out}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
