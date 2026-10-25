# Security scan (SonarQube Cloud + npm audit)

Workflow: [`.github/workflows/security-scan.yml`](../.github/workflows/security-scan.yml), decision: [ADR 0012](adr/0012-sonarqube-cloud-security-scan.md).

Runs on every push to `main` and `online-rooms`, on every pull request, and on demand (Actions → Security scan → Run workflow).

| Job | What it does | Blocking? |
|-----|--------------|-----------|
| `sonarqube` | `npm ci`, unit tests with coverage (`npm run test:coverage` → `coverage/lcov.info`), then SonarQube Cloud analysis of `src/` and `worker/` (vulnerabilities, security hotspots, bugs, code smells, coverage) | Fails if the scan fails. To fail on the Quality Gate too, add `-Dsonar.qualitygate.wait=true` to the action's `args`. |
| `npm-audit` | `npm audit --audit-level=high`, runtime deps (`--omit=dev`) then all deps | No (report only) until the existing high advisories are fixed; see ADR 0012 |

## One-time setup

1. **Create a SonarQube Cloud account with GitHub**: go to <https://sonarcloud.io>, *Log in* → *GitHub*, and authorize.
2. **Create/import the organization**: *+* → *Create new organization* → *Import from GitHub*, pick the GitHub
   account that owns the repo, install the SonarQube Cloud GitHub app (it can be limited to this repo), and choose
   the **Free** plan (free for public repositories).
3. **Import the repo**: *+* → *Analyze new project* → select `Mafia` → *Set up*. For "new code" pick *Previous version*
   or *Number of days* (either is fine).
4. **Check the keys match `sonar-project.properties`**: on the project's *Information* page, compare
   *Project Key* and *Organization Key* with:
   ```properties
   sonar.projectKey=DhanushPrince_Mafia
   sonar.organization=dhanushprince
   ```
   These defaults are what SonarQube Cloud usually generates for `DhanushPrince/Mafia`; if yours differ, edit the file.
5. **Turn off Automatic Analysis** (required: SonarQube Cloud refuses CI analysis while Automatic
   Analysis is on, and the CI job fails): *Administration* → *Analysis Method* →
   switch **Automatic Analysis** off. Choose *GitHub Actions* as the method.
6. **Create a token**: *My Account* → *Security* → *Generate Tokens* (or use the token shown in the GitHub Actions
   tutorial on the Analysis Method page). Copy it.
7. **Add the GitHub secret**: GitHub repo → *Settings* → *Secrets and variables* → *Actions* → *New repository secret*,
   name `SONAR_TOKEN`, value = the token.
8. Push to `main`/`online-rooms` or open a PR. Results: `https://sonarcloud.io/project/overview?id=DhanushPrince_Mafia`.
   Pull requests get a Quality Gate check and a summary comment.

## Notes

- PRs from forks do not receive secrets, so the `sonarqube` job is skipped for them instead of failing.
- The scan action is pinned to a commit SHA (`v8.3.0`). Dependabot or a manual bump keeps it current; check
  <https://github.com/SonarSource/sonarqube-scan-action/releases>.
- `SONAR_HOST_URL` is set to `https://sonarcloud.io`; the action defaults to SonarQube Cloud anyway, so this is explicit
  documentation, not a requirement.
- Excluded from analysis: `node_modules`, `dist`, `e2e/`, `public/` (audio clips and static files), generated
  `src/audio/*.json` line tables, `coverage/`, and test files (tests are indexed as tests, not sources).
- Run locally: `npm run test:coverage` for coverage; `npm audit --omit=dev --audit-level=high` for advisories.
- Coverage on new code (the Quality Gate needs 80%): after `npm run test:coverage`, `npm run coverage:new [baseRef]`
  scores the lines changed vs `origin/main` the way Sonar does ((covered lines + covered conditions) / (lines + conditions)).
  Vitest reports every file under `src/` and `worker/` (`test.coverage.include` in `vite.config.js`), not only imported
  ones, so untested files show up as 0% locally just as they do in Sonar. Component and hook tests run in jsdom via a
  `// @vitest-environment jsdom` comment at the top of the test file; everything else stays in the node environment.
