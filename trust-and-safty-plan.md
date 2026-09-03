# Trust and safety plan

Right: GitHub link helps, but does not prove the site runs that code.

Different proof levels:

- Repository proves: “Here is code JP published.”
- Public deployment workflow proves: “This commit was automatically deployed.”
- Build attestation proves: “This artifact came from this commit and workflow.”
- Matching browser-file hashes proves: “These downloaded client files match that artifact.”
- Nothing simple fully proves server behavior. A malicious server could run different code, change later, or treat users differently.

Best practical trust package:

1. Stop saying “AI-generated mess.” Funny, but sounds unaudited and abandoned. Say: “Open-source TypeScript browser game. No download or account required.”

2. Add a small “About / Safety / Source” page containing:

   - What the site does
   - What data it stores
   - What it does not collect
   - GitHub link to exact `abm-demo` branch
   - Current deployed commit
   - License
   - Contact
   - “Runs entirely in browser except multiplayer communication”

3. Deploy ABM automatically from only the protected `abm-demo` branch using Cloudflare’s Git integration. Cloudflare then records builds tied to GitHub commits. This creates a much stronger public audit trail than manual Wrangler deployment. [Cloudflare Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)

4. Put the exact commit on the site:

   ```text
   Version 98df606 · View source
   ```

   Helpful evidence, though technically JP could make the server lie about the hash.

5. Publish built `dist` files and a SHA-256 manifest through GitHub Actions. Add a GitHub artifact attestation. GitHub attestations cryptographically connect an artifact to its repository, commit, and build workflow. They prove provenance, not that the code is harmless. [GitHub artifact attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations)

6. Keep existing good signals:

   - Custom `jpconan.ca` domain
   - HTTPS
   - Strong CSP/security headers
   - No executable download
   - No login/password request
   - AGPL source
   - Recognizable creator identity
   - Community members independently testing it

Biggest surface-level improvement: clean safety page + exact deployed commit + automated public deployments.

Biggest social improvement: trusted ABM people saying, “I tested this; correct domain is `abm.jpconan.ca`.”

And yes: skepticism toward a surprise Discord link is healthy. Goal not eliminate skepticism. Give cautious people enough information to verify before clicking.
