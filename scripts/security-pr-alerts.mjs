import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const query = `query($owner: String!, $repo: String!, $cursor: String) {
  repository(owner: $owner, name: $repo) {
    vulnerabilityAlerts(first: 100, after: $cursor) {
      nodes {
        vulnerableManifestFilename vulnerableManifestPath vulnerableRequirements state
        securityVulnerability { package { name ecosystem } }
        securityAdvisory { ghsaId }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export async function fetchAlerts(repository, token, request = fetch) {
  if (!token) throw new Error('RELEASE_TOKEN is missing. Configure both Actions and Dependabot secrets.');
  const [owner, repo] = repository.split('/');
  const alerts = [];
  let cursor = null;
  do {
    const response = await request('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { owner, repo, cursor } }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Alert API returned HTTP ${response.status}. Check RELEASE_TOKEN and its Dependabot alerts read permission.`);
    const result = await response.json();
    if (result.errors?.length) throw new Error('Alert GraphQL query failed. Check RELEASE_TOKEN permissions and GitHub API availability.');
    const connection = result.data?.repository?.vulnerabilityAlerts;
    if (!Array.isArray(connection?.nodes) || !connection.pageInfo) throw new Error('Alert API returned an unexpected response.');
    alerts.push(...connection.nodes);
    if (!connection.pageInfo.hasNextPage) return alerts;
    const next = connection.pageInfo.endCursor;
    if (!next || next === cursor) throw new Error('Alert API returned an invalid pagination cursor.');
    cursor = next;
  } while (true);
}

const trimSlashes = (value) => value.replace(/^\/+|\/+$/g, '');

export function matchingAlerts(dependencies, alerts) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) throw new Error('Dependabot dependency metadata is missing.');
  return alerts.filter((alert) => ['OPEN', 'FIXED', 'DISMISSED'].includes(alert?.state) && dependencies.some((dependency) => {
    if (dependency.packageEcosystem !== 'npm_and_yarn' || !dependency.prevVersion || typeof dependency.directory !== 'string') return false;
    const version = alert.vulnerableRequirements?.trim().replace(/^=\s*/, '');
    return alert.securityVulnerability?.package?.ecosystem === 'NPM'
      && alert.securityVulnerability.package.name === dependency.dependencyName
      && version === dependency.prevVersion
      && trimSlashes(alert.vulnerableManifestPath) === trimSlashes(`${trimSlashes(dependency.directory)}/${alert.vulnerableManifestFilename}`);
  }));
}

export async function run(env = process.env, request = fetch) {
  const dependencies = JSON.parse(env.DEPENDENCIES_JSON);
  const matches = matchingAlerts(dependencies, await fetchAlerts(env.GITHUB_REPOSITORY, env.GH_TOKEN, request));
  if (!matches.length && env.DEPENDENCY_GROUP === 'security-fixes') {
    throw new Error('Alert lookup succeeded but no advisory matched this security-fixes PR. Check dependency versions, manifest paths, and the alert data returned by GitHub; this is not an authentication diagnosis.');
  }
  appendFileSync(env.GITHUB_OUTPUT, `security=${matches.length > 0}\n`);
  console.log(`Matched ${matches.length} security advisory(s).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
