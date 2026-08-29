# Docs

Organized using [Diátaxis](https://diataxis.fr/start-here/): four kinds of
content, each answering a different question about the same subject.

- **Reference** — "what is X, exactly?" Lookup-oriented, e.g.
  `reference/glossary.md` and `reference/analysis.md`.
- **Explanation** — "why does this work this way?" Understanding-oriented,
  e.g. `explanation/modules/chess.md`.
- **How-to guides** — "how do I do X?" Task-oriented, e.g.
  `how-to/verify-a-change.md`.
- **Tutorials** — learning by doing, start to finish. Not written yet.

If a term needs defining, it goes in reference. If a module's design needs
justifying, it goes in explanation.

## Reference

Exact rules, configuration and data contracts as they ship today. Each page
pairs with the explanation module doc that carries the reasoning.

- [Analysis](reference/analysis.md) — engine configuration, classification
  thresholds, persisted shapes, cache behavior
- [Ingestion](reference/ingestion.md) — tracked-account ownership, provider
  synchronization, cursors, and game deduplication
- [Opening data](reference/opening-data.md) — what opening information is
  stored, how names are derived, who consumes them
- [Repertoire](reference/repertoire.md) — extraction parameters, judgment
  types and contracts, adherence floors
- [Drills](reference/drills.md) — origins, eligibility and selection rules,
  queue contract, FSRS configuration
- [Glossary](reference/glossary.md) — the chess domain vocabulary
- [Repository layout](reference/repository-layout.md)

## How-to

Start with **[verify-a-change](how-to/verify-a-change.md)** — every other
guide ends there, and "green" here means more than one command.

- [Run locally](how-to/run-locally.md) — the development loop, containers,
  the Dev Container, and how `DATABASE_URL` resolves
- [Self-host](how-to/self-host.md) — a real deployment, and what to do with
  the bootstrap password afterwards
- [Add a migration](how-to/add-a-migration.md) — schema first, generated,
  read before committing
- [Add a package](how-to/add-a-package.md) — and why you probably
  shouldn't
- [Work with Turborepo](how-to/turborepo.md) — VelaChess task ownership,
  caching, filters, affected packages, and CI
- [Verify the public site](how-to/site-quality.md) — static export, SEO,
  screenshots, and Lighthouse

Each one is grounded in something that has actually bitten. When a guide
would have to invent a step, it doesn't exist yet.
