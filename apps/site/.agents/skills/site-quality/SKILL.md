---
name: site-quality
description: Verify VelaChess public-site SEO, accessibility, performance, metadata, deterministic screenshots, and Next.js static-export behavior. Use for apps/site changes or its Lighthouse and site-quality CI workflow.
---

# Verify public-site quality

Read `apps/site/AGENTS.md` and `docs/how-to/site-quality.md`; the how-to owns
current commands, thresholds, and CI names.

Preserve the static export boundary, semantic navigation/headings, keyboard
access, useful alternative text, reserved image dimensions, framework-owned
metadata, Lingui copy, and shared `@velachess/ui` tokens.

Use the deterministic capture flow when product screenshots or their inputs
change. Run the app tests and the current site-quality gate from the how-to.
Diagnose a regression; do not lower a threshold or remove useful content to
make the score pass.
