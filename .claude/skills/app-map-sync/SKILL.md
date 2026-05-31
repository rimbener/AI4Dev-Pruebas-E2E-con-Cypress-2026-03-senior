---
name: app-map-sync
description: >-
  Detect when the Cypress test app map (.claude/skills/cypress-e2e-tests/references/app-map.md)
  has drifted from the real LTI ATS source code and refresh it. The app map records the
  app's real routes, component selectors, Spanish UI labels, seed data, and API surface,
  and the cypress-e2e-tests skill writes specs against it — so a stale map produces specs
  that assert on text/endpoints that no longer exist. Use this skill BEFORE writing Cypress
  E2E tests (the cypress-e2e-tests skill calls it as its first step), and whenever someone
  changes anything the map documents: routes in App.js, a component's labels/placeholders/
  data-cy attributes, backend routes/endpoints, or the Prisma seed data (seed.ts). Trigger
  on phrases like "update the app map", "is the app map still accurate", "I added a route /
  renamed a button / changed the seed — refresh the map", or "the cypress selectors are out
  of date", even when the user doesn't name the file.
---

# app-map-sync — keep the Cypress app map honest

`references/app-map.md` (inside the `cypress-e2e-tests` skill) is a hand-derived
snapshot of how the LTI ATS *actually* looks: real routes, the Spanish labels and
selectors in each component, the seeded entities you can assert on, and the API
surface. The `cypress-e2e-tests` skill reads it before writing any spec and trusts
it instead of guessing. That trust is the whole point — and also the risk. The
moment a button label, a route, an endpoint, or a seed value changes in the source
and the map doesn't, the next spec gets written against a string that no longer
exists and fails for a reason that looks like a test bug.

Your job: figure out whether the map still matches the source, and if not, bring
the affected sections back in line — surgically, touching only what drifted.

## The map's path

```
.claude/skills/cypress-e2e-tests/references/app-map.md
```

Everything below is relative to the repo root
(`AI4Dev-Pruebas-E2E-con-Cypress-2026-03-senior/`). Run git from there.

## Source-of-truth manifest

The map is derived from these files. Each row is the link between a source file (or
group) and the map section it feeds — this is how you turn "what changed" into
"what to re-check". When a file in the left column changes, the section in the right
column is the one to re-derive.

| Source file(s) | Feeds app-map section |
|---|---|
| `frontend/src/App.js` | **Routes** (path → component table) |
| `frontend/src/components/RecruiterDashboard.js` | **Recruiter dashboard `/`** (logo, headings, card buttons) |
| `frontend/src/components/AddCandidateForm.js`, `FileUploader.js` | **Add candidate** (field table, dynamic sections, submit, success/error alert text) |
| `frontend/src/components/Positions.tsx` | **Positions list** (heading, filter controls, card shape, buttons) |
| `frontend/src/components/PositionDetails.js`, `StageColumn.js`, `CandidateCard.js` | **Position details / kanban** (stage columns, candidate cards, drag, the `interviewFlow` capital-F call, the PUT-on-drop) |
| `frontend/src/components/CandidateDetails.js` | **Candidate details panel** (offcanvas title, fields, the interviews POST) |
| `backend/prisma/seed.ts` | **Seed data** (company, positions, candidates, interview steps/types, employees, applications) |
| `backend/src/routes/candidateRoutes.ts`, `positionRoutes.ts` (+ their controllers under `backend/src/presentation/controllers/`) | **API surface (:3010)** (method/endpoint table) |
| `frontend/cypress.config.ts` | the `baseUrl` note (whether `cy.visit` needs a full URL) |

If a brand-new component or route appears that isn't in this manifest, the map needs
a *new* row/section, not just an edit — and this manifest itself should grow to cover
it (edit the table above so the next run knows about it).

## How to detect drift

The map carries a marker at its bottom recording the commit it was last generated
against:

```
<!-- app-map-sync: generated against <full-sha> -->
```

Detection is a diff from that marker to now, across the manifest's source files —
**both** committed changes since the marker **and** uncommitted working-tree changes
(tests are often written against work in progress, so don't ignore the dirty tree).

1. **Read the marker SHA** from the last line of `app-map.md`.
   - If there's **no marker** (legacy or first run), you have no baseline — treat
     every section as suspect and re-derive the whole map from source. Then add the
     marker (see "Re-stamp").

2. **List what changed** since the marker. Run from the repo root:
   ```sh
   # committed changes since the marker, limited to source-of-truth paths
   git diff --name-only <marker-sha> HEAD -- \
     frontend/src/App.js frontend/src/components backend/prisma/seed.ts \
     backend/src/routes backend/src/presentation/controllers frontend/cypress.config.ts
   # plus uncommitted working-tree changes to the same paths
   git status --porcelain -- \
     frontend/src/App.js frontend/src/components backend/prisma/seed.ts \
     backend/src/routes backend/src/presentation/controllers frontend/cypress.config.ts
   ```

3. **Map changed files → sections** via the manifest. If the two commands return
   nothing, the map is current — say so and stop. Don't rewrite a map that hasn't
   drifted; needless churn on this file is its own kind of bug.

## How to update

For each section flagged in step 3 (and only those — leave untouched sections
alone):

1. **Read the current source file(s)** for that section. Pull the *exact* strings a
   test will need: visible Spanish text, `placeholder`s, `controlId`/`id`, `alt`/
   `aria-label`, route paths, `data-cy` attributes, endpoint method+path, seed
   literals. The map's value is that these are copy-pasteable into a spec, so they
   must be character-accurate — a label of `Añadir Nuevo Candidato` is not
   `Añadir nuevo candidato`.

2. **Compare with what the map says** and edit just the drifted lines. Common drifts
   and what they mean for tests:
   - **Label/placeholder renamed** → update the string; any `cy.contains(...)` in a
     future spec depends on it.
   - **New `data-cy` added to a component** → record it; the map should prefer a
     stable `data-cy` over brittle text once one exists, so note it as the
     recommended selector.
   - **Route added/removed/renamed** in `App.js` → update the Routes table (and add
     a whole section if it's a new screen).
   - **Endpoint path/method changed** in a route file → update the API table. Watch
     casing quirks like `/interviewflow` vs the `interviewFlow` the frontend calls —
     if the route file and the component disagree, say so in the map rather than
     silently picking one.
   - **Seed data changed** in `seed.ts` (renamed candidate, new position, different
     stage titles) → update the Seed data section; read flows assert on these names.

3. **Preserve the map's voice and structure.** It's written as practical guidance
   for spec authors ("select with `cy.contains('button', ...)`", "use a fresh email
   per run"), not a dry schema dump. When you update a fact, keep the surrounding
   advice intact unless the advice itself is now wrong.

4. **Re-stamp the marker.** Replace the marker line with the current HEAD SHA so the
   next run diffs from here:
   ```sh
   git rev-parse HEAD
   ```
   Write `<!-- app-map-sync: generated against <that-sha> -->` as the last line.
   (If source changes are still uncommitted, that's fine — stamping HEAD means the
   next run will re-check the still-dirty files via `git status`, which is the safe
   direction.)

## Report back

Tell the user concisely what you found and did:
- If nothing drifted: "app-map.md is up to date (no source-of-truth files changed
  since `<short-sha>`)."
- If you updated it: list which sections changed and the key fact in each (e.g.
  "Add candidate: submit button is now `Guardar`, was `Enviar`; Routes: added
  `/positions/:id/edit`"). Then note that the marker was re-stamped.

Keep edits to `app-map.md` minimal and accurate — this file is a dependency of every
Cypress spec the other skill writes, so correctness beats completeness, and
completeness beats prose.
