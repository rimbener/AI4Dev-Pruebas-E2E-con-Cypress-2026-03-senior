# LTI ATS — app map for E2E tests

Concrete routes, components, real selectors (the UI is in **Spanish**), seed
data, and the API surface. Use these exact strings — guessing labels is the #1
cause of failing specs here.

## Table of contents
- [Routes](#routes)
- [Recruiter dashboard `/`](#recruiter-dashboard-)
- [Add candidate `/add-candidate`](#add-candidate-add-candidate)
- [Positions list `/positions`](#positions-list-positions)
- [Position details / kanban `/positions/:id`](#position-details--kanban-positionsid)
- [Candidate details panel](#candidate-details-panel-offcanvas)
- [Seed data](#seed-data)
- [API surface (:3010)](#api-surface-3010)

## Routes
Defined in `frontend/src/App.js` (React Router v6, `BrowserRouter`):

| Path | Component | File |
|---|---|---|
| `/` | RecruiterDashboard | `frontend/src/components/RecruiterDashboard.js` |
| `/add-candidate` | AddCandidateForm | `frontend/src/components/AddCandidateForm.js` |
| `/positions` | Positions | `frontend/src/components/Positions.tsx` |
| `/positions/:id` | PositionDetails | `frontend/src/components/PositionDetails.js` |

Frontend serves on **:3000**, backend API on **:3010** (hardcoded in
components/services). `baseUrl` is NOT set in `cypress.config.ts` — `cy.visit`
needs the full `http://localhost:3000/...`.

## Recruiter dashboard `/`
`RecruiterDashboard.js`. A logo + two navigation cards.

- Logo: `img[alt="LTI Logo"]`
- Heading: text `Dashboard del Reclutador`
- Card 1 heading `Añadir Candidato`; button `Añadir Nuevo Candidato`
  (`<Link to="/add-candidate">` wrapping a primary `Button`).
- Card 2 heading `Ver Posiciones`; button `Ir a Posiciones`
  (`<Link to="/positions">`).

Select buttons with `cy.contains('button', 'Añadir Nuevo Candidato')`. Clicking
navigates client-side (assert `cy.url().should('include', '/add-candidate')`).

## Add candidate `/add-candidate`
`AddCandidateForm.js`. Heading `Agregar Candidato`. A Bootstrap `Form`; on
submit it `POST`s to `http://localhost:3010/candidates` and renders a success
or error `Alert`.

Top-level fields (label text → `Form.Control`, by `controlId`):

| Label (Spanish) | controlId | name | type | required |
|---|---|---|---|---|
| Nombre | firstName | firstName | text | yes |
| Apellido | lastName | lastName | text | yes |
| Correo Electrónico | email | email | email | yes |
| Teléfono | phone | phone | tel | no |
| Dirección | address | address | text | no |

Target inputs via the React-Bootstrap `controlId` (renders `id`), e.g.
`cy.get('#firstName')`, `#lastName`, `#email`, `#phone`, `#address`. (There are
no `name`-based `data-cy`s yet — add `data-cy` if you prefer, but `#controlId`
is already stable.)

Dynamic sections (start empty; add rows with buttons):
- `Añadir Educación` button → appends an education row with placeholders
  `Institución`, `Título`, and two `react-datepicker` inputs
  (`Fecha de Inicio`, `Fecha de Fin`). Remove button: danger button with
  `<Trash/>` icon + text `Eliminar`.
- `Añadir Experiencia Laboral` button → appends a work-experience row:
  placeholders `Empresa`, `Puesto`, plus the two date pickers. Same `Eliminar`
  remove button.
- Select dynamic inputs by placeholder: `cy.get('input[placeholder="Institución"]')`.
  When multiple rows exist, scope by index or add `data-cy` with the row index.

CV upload: `FileUploader` component (`frontend/src/components/FileUploader.js`)
under label `CV`; posts to `/upload`. For most form specs you can skip the CV
(it's optional) unless the user specifically wants to test upload.

Submit: button `Enviar` (`type="submit"`).

Outcomes to assert on:
- Success → green `Alert`, text **`Candidato añadido con éxito`** (status 201).
- Validation error → red `Alert` starting `Error al añadir candidato:` (the
  component surfaces 400/500 messages).

Dates: the component calls `.toISOString().slice(0,10)` on the picked date, so a
date is only sent if you actually pick one in the picker. Native HTML5 `required`
blocks submit when Nombre/Apellido/Correo are empty — useful for a
validation-path test (assert the success alert does NOT appear).

`Candidate.email` is **unique** in the DB. Use a fresh email per run (e.g.
`` `e2e-${Date.now()}@example.com` ``, but note `Date.now()` is fine inside
Cypress specs) so re-runs don't 400.

## Positions list `/positions`
`Positions.tsx`. On mount, `GET http://localhost:3010/positions` and renders a
card grid. Heading `Posiciones`.

- Back link: button (variant link) text `Volver al Dashboard` → navigates `/`.
- Filter row (4 controls — currently **UI-only, not wired to filtering**):
  - `input[placeholder="Buscar por título"]` (text)
  - a `type="date"` input
  - status `<select>` with options: `Estado` (empty), `Abierto`, `Contratado`,
    `Cerrado`, `Borrador`
  - manager `<select>`: `Manager` (empty), `John Doe`, `Jane Smith`, `Alex Jones`
- Each position renders a Bootstrap `Card`:
  - `Card.Title` = `position.title`
  - `Card.Text`: `Manager:` + `contactInfo`, `Deadline:` + formatted date
    (`dd/mm/yyyy`)
  - status `<span class="badge ...">` showing `position.status` (note: seed
    status is `Open`, rendered literally)
  - buttons: `Ver proceso` (primary → navigates `/positions/:id`) and `Editar`
    (secondary, no handler).

The position cards have no `data-cy`; to target a specific card, either
`cy.contains('.card', 'Senior Full-Stack Engineer')` or add
`data-cy="position-card"` (and an id variant) to the `Card` in `Positions.tsx`.
`Ver proceso` is the click target to reach the kanban board.

## Position details / kanban `/positions/:id`
`PositionDetails.js` + `StageColumn.js` + `CandidateCard.js`. **Drag-and-drop
board** built with `react-beautiful-dnd`. See the "Drag-and-drop" section in
SKILL.md — native drag events do NOT work here.

On mount it calls (note the **capital F**, this is what the app really requests):
- `GET http://localhost:3010/positions/:id/interviewFlow` → stage columns
- `GET http://localhost:3010/positions/:id/candidates` → candidates, placed into
  the column whose `title` matches `candidate.currentInterviewStep`.

DOM:
- Back link: button text `Volver a Posiciones` → `/positions`.
- Heading `<h2>` = the position name (from the interviewFlow response).
- Each stage is a `Col md={3}` → `Droppable droppableId={index}` → `Card` with
  `Card.Header` (centered) = stage title (e.g. `Initial Screening`,
  `Technical Interview`, `Manager Interview`).
- Each candidate is a `Draggable` `Card` (`CandidateCard.js`) with
  `Card.Title` = candidate full name and a rating shown as N × 🟢
  (`span[role="img"][aria-label="rating"]`). `draggableId` = candidate id
  (string). Clicking a card opens the details panel.

For drag tests add `data-cy`:
- `StageColumn.js`: `data-cy="stage-column"` (+ maybe the stage title/index) on
  the column `Card`.
- `CandidateCard.js`: `` data-cy={`candidate-card-${candidate.id}`} `` on the
  draggable `Card`.

Dropping fires `PUT http://localhost:3010/candidates/:candidateId` with
`{ applicationId, currentInterviewStep }`. Intercept it to confirm the move went
end-to-end.

## Candidate details panel (offcanvas)
`CandidateDetails.js` — opens when a candidate card is clicked
(`Offcanvas show={!!candidate}`, slides from the right). Title
`Detalles del Candidato` (verify exact text in the component before asserting).
Lets you add interview notes/score; posts to `/candidates/:id/interviews`.
Close via the offcanvas close button. Read `CandidateDetails.js` for its exact
fields/labels before writing a spec that drives it.

## Seed data
`backend/prisma/seed.ts`, run with `cd backend && npm run seed`. Known entities
you can assert on:

- **Company:** `LTI`
- **Positions (2, status `Open`, remote, deadline 2024-12-31):**
  - `Senior Full-Stack Engineer`
  - `Data Scientist`
- **Candidates (3):**
  - `John Doe` — john.doe@gmail.com (full-stack)
  - `Jane Smith` — jane.smith@gmail.com (data science)
  - `Carlos García` — carlos.garcia@example.com
- **Interview steps (stage column titles):** `Initial Screening`,
  `Technical Interview`, `Manager Interview`
- **Interview types:** `HR Interview`, `Technical Interview`,
  `Hiring manager interview`
- **Employees:** `Alice Johnson` (Interviewer), `Bob Miller` (Hiring Manager)
- 4 Applications + 3 Interview records (results Passed, scores 4–5).

Position ids are assigned in seed order; don't hardcode an id — fetch
`GET /positions` and read the id for a title if a spec needs to deep-link.

## API surface (:3010)
For `cy.request` setup/teardown and end-to-end assertions. CORS allows only
`http://localhost:3000`, but `cy.request` issues server-side requests so CORS
doesn't apply.

| Method | Endpoint | Purpose / shape |
|---|---|---|
| POST | `/candidates` | Create candidate (firstName, lastName, email, phone, address, educations[], workExperiences[], cv?) → 201 + candidate |
| GET | `/candidates/:id` | Candidate with relations |
| PUT | `/candidates/:id` | Move interview stage: `{ applicationId, currentInterviewStep }` |
| POST | `/candidates/:id/interviews` | Add interview (notes, score) |
| GET | `/positions` | All positions (array) |
| GET | `/positions/:id/candidates` | Candidates for a position (fullName, currentInterviewStep, averageScore, applicationId, candidateId) |
| GET | `/positions/:id/interviewFlow` | Interview flow + stages (note capital F as the app calls it; `api-spec.yaml` lists lowercase — verify which the backend route accepts) |
| POST | `/upload` | multer CV upload → `{ filePath, fileType }` |
