---
name: cypress-e2e-tests
description: >-
  Write Cypress end-to-end (E2E) test specs for the LTI Talent Tracking System
  (the ATS recruiting app in this repo: React frontend on :3000, Express/Prisma
  backend on :3010). Use this whenever the user wants to add, write, or scaffold
  Cypress E2E tests, .cy.ts/.cy.js spec files, browser tests, or test a user
  flow end-to-end here — covering the recruiter dashboard, the add-candidate
  form, the positions list, the kanban interview board (drag-and-drop), or the
  candidate-details panel. Trigger even when the user just names a flow ("test
  adding a candidate", "write a test for the positions page", "cover the kanban
  board") without saying the word "Cypress".
---

# Cypress E2E tests for the LTI ATS

This skill writes Cypress E2E spec files for **this specific app**. Cypress is
already installed and configured (`frontend/cypress.config.ts`, support files
under `frontend/cypress/support/`). Your job is to author `*.cy.ts` specs under
`frontend/cypress/e2e/`, and — only when a stable selector doesn't already
exist — add `data-cy` attributes to the React components those specs target.

The app is **in Spanish** (UI labels like "Añadir Nuevo Candidato",
"Posiciones", "Volver al Dashboard"). Tests run against a **live backend +
seeded database**, not stubs. So before writing, you need to know the real
routes, the real labels, and the real seed data. That map lives in
`references/app-map.md` — **read it before writing any spec.** It is the
difference between a test that passes and one that asserts on text that doesn't
exist.

## Workflow

1. **Read `references/app-map.md`.** It has the routes, every component's real
   selectors and Spanish labels, the seed data (named candidates/positions you
   can assert on), and the API surface for `cy.request` setup. Don't guess
   labels or endpoints — they have quirks (e.g. the interview-flow URL the app
   actually calls is `/positions/:id/interviewFlow`, capital F).

2. **Identify the flow** the user asked for and find its component(s) in the
   map. If they were vague ("test the candidate flow"), pick the most likely
   one and say which you chose.

3. **Decide selectors.** Prefer what's already in the DOM — visible Spanish
   text, placeholders, roles, `alt`/`aria-label`. Reach for a `data-cy`
   attribute only when the element is genuinely hard to target reliably (see
   "When to add data-cy" below). Every `data-cy` you add is app code you're
   changing, so add it deliberately, not by default.

4. **Decide data strategy.** This is full-stack E2E — see "Test data" below.
   Read flows lean on the seed; write/mutation flows should set up and clean up
   their own data via `cy.request` so they're repeatable.

5. **Write the spec** under `frontend/cypress/e2e/<flow>.cy.ts`. Follow the
   structure and conventions below.

6. **Add any `data-cy` attributes** you decided on, editing the real component
   files. Keep edits surgical — one attribute on the element, nothing else.

7. **Tell the user how to run it** and what has to be up first (db + seed,
   backend on :3010, frontend on :3000). Don't claim the test passes unless you
   actually ran it against a running stack.

## Selectors: when to add `data-cy`

The goal is tests that survive cosmetic refactors without coupling to brittle
DOM structure. Order of preference:

1. **Visible text / role / placeholder** when it's unambiguous and unlikely to
   churn — `cy.contains('button', 'Añadir Nuevo Candidato')`,
   `cy.get('input[placeholder="Buscar por título"]')`,
   `cy.get('img[alt="LTI Logo"]')`. This is the default; no app change needed.

2. **`data-cy` attribute** when text/role isn't enough:
   - The element is rendered in a list/loop and you need a *specific* one
     (a candidate card on the kanban board, a position card in the grid).
   - The target has no stable text (icon-only buttons, the drag handle).
   - The text is data-dependent and could change with the seed.
   - You're targeting a container/region to scope queries (a stage column).

   Use kebab-case, descriptive names: `data-cy="add-candidate-btn"`,
   `data-cy="position-card"`, `data-cy="stage-column"`,
   `data-cy="candidate-card"`. For looped items, include an identifier:
   `data-cy={\`candidate-card-${candidate.id}\`}`. In the spec, select with the
   `[data-cy=...]` attribute selector (optionally add a `cy.get` helper, but a
   custom command isn't required).

Avoid selecting on Bootstrap utility or CSS classes (`.shadow`, `.mb-3`, `.btn-block`)
or on `Col md={3}` structure — those are styling and layout, they'll move.

## Test data via `cy.request`

The frontend talks to `http://localhost:3010`. Tests should treat that API as
the source of truth for state:

- **Read/display flows** (viewing positions, opening the kanban board) can rely
  on the seed. Assert against the known seeded names from the map (e.g. position
  "Senior Full-Stack Engineer", candidate "John Doe"). Note in the spec that it
  assumes a seeded DB.

- **Write/mutation flows** (submitting the add-candidate form, moving a
  candidate between stages) must be self-contained: create prerequisites in
  `before`/`beforeEach` AND undo the mutation in `afterEach`/`after` via
  `cy.request`. Resetting only in `beforeEach` is not enough — it fixes *this*
  spec's precondition but leaves the shared seed DB mutated for everything that
  runs after. A read-only spec like `position-page-load` asserts on seed
  placement (Carlos in Initial Screening), so if a drag spec moves him and
  doesn't move him back, that read spec fails — and only in some run orders,
  which makes it look flaky. The rule: **leave the seeded DB exactly as you
  found it.** A mutation spec that cleans up after itself is both repeatable and
  order-independent; one that doesn't will silently corrupt sibling specs.

- Use unique values to avoid collisions with the seed or prior runs — e.g. a
  generated email so re-running the add-candidate spec doesn't hit the unique
  constraint on `Candidate.email`.

- You can assert on the *backend result* too, not just the UI: after submitting
  the form, `cy.request` the candidate back and check it persisted. End-to-end
  means the data made it all the way through.

Define reusable setup as a custom command in
`frontend/cypress/support/commands.ts` (with a matching type in the
`declare global` block there) when more than one spec needs it — e.g.
`cy.createCandidate(payload)`. For one-off setup, an inline `cy.request` in the
spec is fine; don't over-abstract.

## Spec structure

```ts
// frontend/cypress/e2e/add-candidate.cy.ts
describe('Add candidate', () => {
  beforeEach(() => {
    cy.visit('http://localhost:3000/add-candidate');
  });

  it('submits a new candidate and shows the success message', () => {
    // ...interact with real Spanish labels...
    cy.contains('Candidato añadido con éxito').should('be.visible');
  });
});
```

Conventions:
- One `describe` per flow/screen; `it` titles state the user-visible outcome.
- `baseUrl` is **not** set in `cypress.config.ts`, so `cy.visit` needs the full
  `http://localhost:3000/...` URL. (If a spec would read cleaner with `baseUrl`,
  you may set it in the config — but mention you changed config, since the skill
  is otherwise spec-only.)
- Assert on outcomes the user would see (success alert, candidate appearing in a
  column, navigation to a new route), not on implementation details.
- Wait on the network, not on time. Use `cy.intercept(...).as('x')` +
  `cy.wait('@x')` to deterministically wait for the API call a flow triggers,
  instead of `cy.wait(3000)`. (Interception here is for *synchronization*, not
  stubbing — let the request hit the real backend.)

## Drag-and-drop (kanban board) — read this before testing the board

`PositionDetails.js` uses **`react-beautiful-dnd`**, which does not respond to a
naive `.trigger('dragstart')` / native HTML5 drag events. It listens for a
sequence of pointer/keyboard events. Testing it reliably is the trickiest part
of this app. Two viable approaches, in order of preference:

1. **Keyboard drag (most robust with react-beautiful-dnd):** focus the draggable
   then drive its built-in keyboard sensor — space to lift, arrow keys to move,
   space to drop:
   ```ts
   cy.get('[data-cy=candidate-card-1]')
     .focus()
     .trigger('keydown', { keyCode: 32 });           // space: lift
   cy.get('[data-cy=candidate-card-1]')
     .trigger('keydown', { keyCode: 39, force: true })// arrow right: next column
     .trigger('keydown', { keyCode: 32, force: true });// space: drop
   ```
   Then assert the candidate now appears under the destination stage column and,
   end-to-end, that the `PUT /candidates/:id` fired (intercept + `cy.wait`).

2. **Mouse pointer sequence:** `mousedown` → `mousemove` (a few steps, with
   `{ force: true }` and clientX/clientY toward the target) → `mouseup`. More
   fragile across versions; use only if the keyboard approach doesn't fit.

Either way you'll need `data-cy` on the candidate cards and stage columns
(`CandidateCard.js`, `StageColumn.js`) to target a specific card and assert
which column it landed in. Verify the move both in the UI and via the backend.

## After writing

Tell the user the exact run steps and prerequisites. Typical sequence:

```sh
# 1. stack up (from repo root, then backend)
docker compose up -d
cd backend && npm run seed && npm run dev   # backend :3010
# 2. in another terminal
cd frontend && npm start                    # frontend :3000
# 3. run cypress
cd frontend && npx cypress run              # headless
cd frontend && npx cypress open             # interactive
```

There are no `cypress` scripts in `frontend/package.json` yet — use `npx
cypress run`/`open`, or offer to add `"cypress:open"` / `"cypress:run"` scripts
if the user wants them (that's a package.json change, so ask first).

If you actually ran the spec, report the real result (pass/fail + output). If
you couldn't run it (stack not up), say so plainly rather than implying it
passed.
