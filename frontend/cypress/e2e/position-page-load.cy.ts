// E2E: loading the kanban board for a position (/positions/:id).
//
// This is a READ/DISPLAY flow, so it relies on the seeded database
// (backend/prisma/seed.ts, run with `cd backend && npm run seed`).
// It does NOT hardcode a position id — it looks up the id for the known
// seeded title via GET /positions, since ids are assigned in seed order.
//
// Prerequisites to run:
//   docker compose up -d
//   cd backend && npm run seed && npm run dev   # API on :3010
//   cd frontend && npm start                    # app on :3000
//   cd frontend && npx cypress run --spec cypress/e2e/position-page-load.cy.ts
//
// Selectors:
//   - Position title: the <h2> heading rendered from the interviewFlow response.
//   - Stage columns: data-cy="stage-column-${index}" on the Card in StageColumn.js.
//   - Candidate cards: data-cy="candidate-card-${candidate.id}" on the Card in
//     CandidateCard.js. We assert candidate placement by matching the visible
//     card title (the candidate name) within the scoped stage column.

describe('Position kanban board loads (/positions/:id)', () => {
  // The seeded "Senior Full-Stack Engineer" position uses interviewFlow1,
  // whose ordered steps are these three columns.
  const POSITION_TITLE = 'Senior Full-Stack Engineer';
  const STAGES = ['Initial Screening', 'Technical Interview', 'Manager Interview'];

  // From the seed: applications on this position place candidates as follows.
  //   - Carlos García  -> Initial Screening
  //   - John Doe       -> Technical Interview
  //   - Jane Smith     -> Technical Interview
  //   - Manager Interview column is empty
  const EXPECTED_PLACEMENT: Record<string, string> = {
    'Carlos García': 'Initial Screening',
    'John Doe': 'Technical Interview',
    'Jane Smith': 'Technical Interview',
  };

  beforeEach(() => {
    // Resolve the position id by title rather than hardcoding it.
    cy.request('http://localhost:3010/positions').then((res) => {
      expect(res.status).to.eq(200);
      const position = (res.body as Array<{ id: number; title: string }>).find(
        (p) => p.title === POSITION_TITLE
      );
      expect(position, `seeded position "${POSITION_TITLE}" exists`).to.not.be.undefined;

      // Synchronize on the two requests the board fires on mount, so assertions
      // run only after the columns and candidates have been rendered.
      cy.intercept('GET', `**/positions/${position!.id}/interviewFlow`).as('interviewFlow');
      cy.intercept('GET', `**/positions/${position!.id}/candidates`).as('candidates');

      cy.visit(`http://localhost:3000/positions/${position!.id}`);

      cy.wait('@interviewFlow');
      cy.wait('@candidates');
    });
  });

  it('shows the position title', () => {
    cy.get('h2').should('have.text', POSITION_TITLE);
  });

  it('renders one column per hiring-process stage, in order', () => {
    cy.get('[data-cy^="stage-column-"]').should('have.length', STAGES.length);

    // The columns appear in the seeded interview-flow order.
    cy.get('[data-cy^="stage-column-"] .card-header').then(($headers) => {
      const titles = [...$headers].map((el) => el.textContent?.trim());
      expect(titles).to.deep.equal(STAGES);
    });
  });

  it('places each candidate card in the column matching its current stage', () => {
    // Every seeded candidate card is rendered on the board...
    Object.keys(EXPECTED_PLACEMENT).forEach((name) => {
      cy.get('[data-cy^="candidate-card-"]').contains('.card-title', name).should('exist');
    });

    // ...and each one lives inside the column for its current interview step.
    Object.entries(EXPECTED_PLACEMENT).forEach(([name, stage]) => {
      cy.contains('[data-cy^="stage-column-"]', stage).within(() => {
        cy.contains('.card-title', name).should('exist');
      });
    });

    // The "Manager Interview" column has no candidates in the seed.
    cy.contains('[data-cy^="stage-column-"]', 'Manager Interview')
      .find('[data-cy^="candidate-card-"]')
      .should('not.exist');

    // Cross-check: a candidate from one stage must NOT appear in another.
    cy.contains('[data-cy^="stage-column-"]', 'Initial Screening').within(() => {
      cy.contains('.card-title', 'John Doe').should('not.exist');
      cy.contains('.card-title', 'Jane Smith').should('not.exist');
    });
  });
});
