# Notice of Modification

Date: 2026-10-15
Author: Shankar Pratap Singh (NEXUS Team)

`web/` was created from `FalkorDB/falkordb-browser` v2.3.1 (https://github.com/FalkorDB/falkordb-browser), licensed under the Elastic License 2.0 (ELv2) / Server Side Public License (SSPL). The files were modified, and later in the same project the upstream application code was removed.

## Current state

`web/` now contains only the NEXUS HUD:

- `web/app/nexus/`, `web/components/nexus/` and `web/lib/nexus/` are original work.
- The remaining configuration files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`, `tsconfig.json`, `eslint.config.mjs`) are standard Next.js project files that were reduced from the upstream versions.
- No upstream application source, authentication code, or graph explorer remains.

The upstream `LICENSE.txt` is kept in `web/` as a precaution.

## History

- Modified upstream files: theme, navigation, layout, login bypass and Next.js config.
- Removed in commit "chore(web): remove upstream browser and authentication": the graph explorer, settings, UDF, docs, monitor, connection manager, NextAuth login, token storage, encryption APIs and all upstream tests.

Use `git log -- web/` to see the exact changes.
