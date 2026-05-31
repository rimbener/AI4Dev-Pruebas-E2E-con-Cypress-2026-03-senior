// E2E: moving a candidate card between kanban columns on the position-details
// board, verifying both the UI move and the persisted backend change.
//
// Board under test: position "Senior Full-Stack Engineer". Its interview flow
// has three ordered stage columns:
//   index 0 -> "Initial Screening"
//   index 1 -> "Technical Interview"
//   index 2 -> "Manager Interview"
//
// Per the seed (backend/prisma/seed.ts), candidate "Carlos García" is the only
// candidate in "Initial Screening" for this position. We drag him one column to
// the right, into "Technical Interview".
//
// PREREQUISITES (stack must be up):
//   docker compose up -d
//   cd backend && npm run seed && npm run dev   # :3010
//   cd frontend && npm start                    # :3000
//   cd frontend && npx cypress run --spec cypress/e2e/candidate-stage-change.cy.ts
//
// The board uses react-beautiful-dnd, which ignores native HTML5 drag events.
// We drive its built-in keyboard sensor (space = lift, arrow = move, space =
// drop) — the most robust approach with this library.

const API = 'http://localhost:3010';
const APP = 'http://localhost:3000';

const POSITION_TITLE = 'Senior Full-Stack Engineer';
const CANDIDATE_NAME = 'Carlos García';

const FROM_STAGE = 'Initial Screening';
const TO_STAGE = 'Technical Interview';

type ApiCandidate = {
  fullName: string;
  currentInterviewStep: string;
  applicationId: number;
  candidateId: number;
};

type Stage = { name: string; id: number };

describe('Kanban board — candidate stage change', () => {
  let positionId: number;
  let stages: Stage[];
  let candidate: ApiCandidate;

  // Resolve seed-dependent ids dynamically (never hardcode db ids) and reset
  // the candidate to its starting stage so the spec is repeatable / order-
  // independent: a previous (possibly failed) run may have left him moved.
  beforeEach(() => {
    cy.request('GET', `${API}/positions`).then((res) => {
      const pos = res.body.find((p: any) => p.title === POSITION_TITLE);
      expect(pos, `seed position "${POSITION_TITLE}"`).to.exist;
      positionId = pos.id;

      // Stage columns (id + name) come from the interview flow. Note the
      // capital F — that's the route the app actually calls.
      return cy.request('GET', `${API}/positions/${positionId}/interviewFlow`);
    }).then((res) => {
      stages = res.body.interviewFlow.interviewFlow.interviewSteps.map((s: any) => ({
        name: s.name,
        id: s.id,
      }));
      const fromStage = stages.find((s) => s.name === FROM_STAGE);
      expect(fromStage, `stage "${FROM_STAGE}"`).to.exist;

      // Find the candidate and force him back into the FROM stage.
      return cy.request('GET', `${API}/positions/${positionId}/candidates`).then((cRes) => {
        candidate = (cRes.body as ApiCandidate[]).find((c) => c.fullName === CANDIDATE_NAME)!;
        expect(candidate, `seed candidate "${CANDIDATE_NAME}"`).to.exist;

        return cy.request('PUT', `${API}/candidates/${candidate.candidateId}`, {
          applicationId: candidate.applicationId,
          currentInterviewStep: fromStage!.id,
        });
      });
    });
  });

  // Restore the candidate to his seed stage (Initial Screening) after each test
  // so we leave the shared/seeded DB exactly as we found it. Other specs that
  // read this position (e.g. position-page-load) depend on the seed placement,
  // so a mutation spec must not leak state — order-independence requires it.
  afterEach(() => {
    if (candidate && stages) {
      const fromStage = stages.find((s) => s.name === FROM_STAGE);
      if (fromStage) {
        cy.request({
          method: 'PUT',
          url: `${API}/candidates/${candidate.candidateId}`,
          body: {
            applicationId: candidate.applicationId,
            currentInterviewStep: fromStage.id,
          },
          failOnStatusCode: false,
        });
      }
    }
  });

  it('drags a candidate to the next column and persists the new stage in the backend', () => {
    // Intercept the PUT the drop will trigger so we can wait on the network
    // (not on time) and assert the end-to-end call shape.
    cy.intercept('PUT', `${API}/candidates/*`).as('updateStage');

    cy.visit(`${APP}/positions/${positionId}`);

    // Board has rendered: heading is the position name and the candidate card
    // currently lives under the FROM column.
    cy.contains('h2', POSITION_TITLE).should('be.visible');

    cy.get(`[data-cy=stage-column-${stageIndex(FROM_STAGE)}]`)
      .contains('.card', CANDIDATE_NAME)
      .should('exist');

    // --- Drag: keyboard sensor of react-beautiful-dnd ---
    // space = lift, ArrowRight = move to next droppable, space = drop.
    cy.get(`[data-cy=candidate-card-${candidate.candidateId}]`)
      .focus()
      .trigger('keydown', { keyCode: 32 }); // space: lift

    cy.get(`[data-cy=candidate-card-${candidate.candidateId}]`)
      .trigger('keydown', { keyCode: 39, force: true }) // ArrowRight: next column
      .trigger('keydown', { keyCode: 32, force: true }); // space: drop

    // 1) Backend update fired with the correct payload (end-to-end).
    cy.wait('@updateStage').then(({ request, response }) => {
      const toStage = stages.find((s) => s.name === TO_STAGE)!;
      expect(request.url).to.include(`/candidates/${candidate.candidateId}`);
      expect(request.body).to.deep.equal({
        applicationId: candidate.applicationId,
        currentInterviewStep: toStage.id,
      });
      expect(response?.statusCode).to.be.oneOf([200, 201]);
    });

    // 2) UI: the card now lives under the destination column and no longer
    //    under the source column.
    cy.get(`[data-cy=stage-column-${stageIndex(TO_STAGE)}]`)
      .contains('.card', CANDIDATE_NAME)
      .should('be.visible');

    cy.get(`[data-cy=stage-column-${stageIndex(FROM_STAGE)}]`)
      .contains(CANDIDATE_NAME)
      .should('not.exist');

    // 3) Backend is the source of truth: re-fetch and confirm the persisted
    //    stage matches the destination column title.
    cy.request('GET', `${API}/positions/${positionId}/candidates`).then((res) => {
      const moved = (res.body as ApiCandidate[]).find((c) => c.fullName === CANDIDATE_NAME)!;
      expect(moved.currentInterviewStep).to.equal(TO_STAGE);
    });
  });

  // Stage column index = position in the interview-flow order. Used to build
  // the data-cy selector the StageColumn component exposes.
  function stageIndex(name: string): number {
    return stages.findIndex((s) => s.name === name);
  }
});
