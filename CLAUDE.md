# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

LTI – Talent Tracking System (ATS). Full-stack monorepo:
- `backend/` – Express + TypeScript REST API, Prisma ORM over PostgreSQL. Runs on port **3010**.
- `frontend/` – Create React App (React 18, mixed JS/TSX), Bootstrap. Runs on port **3000**.

The two packages have **separate `package.json` files**; there is no root workspace tooling. The root `package.json` only holds `dotenv` and points Prisma at `backend/prisma/schema.prisma`.

## Commands

### Database (run from repo root)
```sh
docker compose up -d      # start PostgreSQL (reads .env for DB_* vars)
docker compose down
```
After the DB is up, generate the Prisma client from `backend/`: `npx prisma generate` (or `npm run prisma:generate`).

### Backend (`cd backend`)
```sh
npm run dev          # ts-node-dev, hot reload from src/index.ts
npm run build        # tsc -> dist/
npm start            # node dist/index.js (requires build first)
npm test             # jest (ts-jest preset, node env)
npm test -- candidateService   # run a single test file by name pattern
```

### Frontend (`cd frontend`)
```sh
npm start            # CRA dev server on :3000
npm run build
npm test             # jest --config jest.config.js
```

The frontend hardcodes the backend URL as `http://localhost:3010` in `src/services/`. CORS in `backend/src/index.ts` only allows `http://localhost:3000`.

## Backend architecture

Layered / DDD-style structure under `backend/src/`. A request flows **route → controller → service → Prisma**:

- `routes/` – Express routers, one per resource (`candidateRoutes.ts`, `positionRoutes.ts`). Mounted in `index.ts` at `/candidates`, `/positions`, plus `/upload`.
- `presentation/controllers/` – parse/validate HTTP input, call services, shape responses & status codes.
- `application/services/` – business logic and all Prisma data access (e.g. `candidateService.ts`, `positionService.ts`, `fileUploadService.ts`). `validator.ts` holds input validation.
- `domain/models/` – plain TypeScript domain classes (`Candidate`, `Position`, `Application`, `Interview`, etc.) mirroring the Prisma schema.

`index.ts` attaches a single shared `PrismaClient` to every request via `req.prisma` (the `Express.Request` interface is augmented globally there). Note that services may also instantiate their own `PrismaClient` — check the specific service before assuming `req.prisma` is the only DB handle.

Tests live **next to source** as `*.test.ts` (e.g. `candidateService.test.ts`, `candidateController.test.ts`), not in a separate `tests/` directory (the README's mention of `tests/` and `infrastructure/` directories is outdated — they don't exist).

### API surface
- `POST /candidates`, `GET /candidates/:id`, `PUT /candidates/:id` (update interview stage)
- `GET /positions`, `GET /positions/:id/candidates`, `GET /positions/:id/interviewflow`
- `POST /upload` (multer file upload for resumes)

Full spec: `backend/api-spec.yaml`. Data model & diagram: `backend/ModeloDatos.md`. Coding conventions (Spanish): `backend/ManifestoBuenasPracticas.md` — follow it when adding endpoints; `backend/src/prompts/CreateNewRoute.md` documents the per-layer recipe for a new route.

## Data model

Prisma schema (`backend/prisma/schema.prisma`, PostgreSQL) centers on recruiting:
`Candidate` (with `Education`, `WorkExperience`, `Resume`) applies via `Application` to a `Position`. Each `Position` belongs to a `Company` and follows an `InterviewFlow` composed of ordered `InterviewStep`s (each of an `InterviewType`). `Application.currentInterviewStep` tracks pipeline stage; `Interview` records an `Employee`'s evaluation (result/score) for an application at a step.

## Notes

- `.env` (DB credentials, `DATABASE_URL`) lives at the **repo root**; `docker-compose.yml` and Prisma both read it. The schema currently has the connection string hardcoded as a fallback.
- This branch (`Hernan-Laura-LTI-e2e-tests`) is for adding **Cypress E2E tests** — none exist yet, so any Cypress config/structure must be created from scratch.
