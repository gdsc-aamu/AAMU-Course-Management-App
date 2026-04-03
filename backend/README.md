# Backend Service Architecture

This document defines ownership boundaries and structure for the backend layer.

## Ownership Boundaries

### Frontend (UI Only)
- **Location**: `/app`, `/components`, `/hooks`
- **Responsibility**: React components, routing, form handling, user interactions
- **Prohibited**: Business logic, database queries, API client initialization
- **Dependencies**: Calls `/app/api/*` routes only; imports from `shared/contracts` for types

### Shared Contracts
- **Location**: `/shared/contracts`
- **Responsibility**: Request/response schemas, type definitions shared between frontend and backend
- **Ownership**: Backend and Frontend teams agree on changes

### Backend Services
- **Locations**: `/backend/services/*`
- **Responsibility**: Business logic for each domain (rag, curriculum, pdf-parsing)
- **Structure**:
  - `rag/` — Bulletin search, response generation, RAG retrieval
  - `curriculum/` — Course prerequisites, program overviews, curriculum templates
  - `pdf-parsing/` — DegreeWorks PDF extraction, student info parsing
- **Rule**: Services are **never imported by frontend**; they are called through API routes only

### Data Access Layer
- **Location**: `/backend/data-access`
- **Responsibility**: Supabase query construction, environment setup, connection pooling
- **Rule**: All database access goes through this layer; services call data-access, not Supabase directly

### Orchestration & Controllers
- **Locations**: `/app/api/*` route handlers, `/backend/orchestration`
- **Responsibility**: Request validation, routing decisions, calling services, response formatting
- **Rule**: Thin; delegates to services; does not contain business logic

### Data & Infrastructure
- **Locations**: `/backend/schema.sql`, `/backend/seed.py`, `/backend/bulletin_chunks.sql`, `/RAG`
- **Responsibility**: Database schemas, seed scripts, ingestion pipeline, bulletin data
- **Ownership**: Data team; not part of runtime API

---

## Current State vs. Target

### Issues to Fix

1. **Business logic in app/api/chat/query/route.ts**
   - `handleDbOnly()` constructs curriculum responses (belongs in curriculum service)
   - `handleRagOnly()` calls RAG search directly (belongs in rag service)
   - `handleHybrid()` orchestrates both (should remain thin)

2. **Data access scattered across lib/**
   - `lib/db/curriculum.ts` contains Supabase queries + formatting
   - `lib/rag/search.ts` contains Supabase queries + LLM calls
   - Should be split: data-access layer + service layer

3. **PDF parsing isolated in api/**
   - `api/main.py`, `api/models.py`, `api/parser.py` are correct, but not part of orchestrated backend
   - Should be exposed via Next.js API route for consistency

### Target After Refactor

```
/backend
  /services
    /curriculum
      service.ts       (exports fetchCurriculumContext, fetchProgramOverview, etc.)
    /rag
      service.ts       (exports searchBulletin, generateRagResponse, generateHybridResponse)
    /pdf-parsing
      service.ts or .py (wraps the existing api/ code; exposed via API route)
  /data-access
    curriculum.ts      (raw Supabase queries for courses, prerequisites, programs)
    bulletin.ts        (raw Supabase queries for bulletin chunks)
  /orchestration
    chat-router.ts     (routing logic; can stay here)

/shared
  /contracts
    index.ts           (all request/response types)

/app/api
  /chat
    /query
      route.ts         (thin controller; calls orchestration + services)
```

---

## Migration Phases

### Phase 1: Establish Boundaries (Current)
- [x] Create `/backend/services/*` folders
- [x] Create `/backend/data-access` folder
- [x] Create `/shared/contracts` and consolidate types
- [ ] Document current slow points and ownership (this file)
- [ ] Mark services as "contracts-only" (placeholder exports)

### Phase 2: Move Data Access
- [ ] Extract Supabase queries from `lib/db/curriculum.ts` → `backend/data-access/curriculum.ts`
- [ ] Extract Supabase queries from `lib/rag/search.ts` → `backend/data-access/bulletin.ts`
- [ ] Update lib files to call data-access layer

### Phase 3: Extract Services
- [ ] Move business logic from `lib/db/curriculum.ts` → `backend/services/curriculum/service.ts`
- [ ] Move business logic from `lib/rag/search.ts` → `backend/services/rag/service.ts`
- [ ] Create `backend/services/pdf-parsing/service.ts` as thin wrapper around `api/`

### Phase 4: Thin Out Route Handlers
- [ ] Replace business logic in `/app/api/chat/query/route.ts` with service calls
- [ ] Ensure route handler only validates, routes, and formats

### Phase 5: Verification
- [ ] Add tests for service boundaries
- [ ] Check that frontend never imports from `/backend/services`
- [ ] Run end-to-end chat flow test

---

## Rules for This Codebase

1. **Frontend never imports from `/backend/services`**
2. **Services never call `getSupabaseClient()` directly; they call data-access layer**
3. **All types shared between frontend/backend live in `/shared/contracts`**
4. **API routes in `/app/api` are thin controllers; logic lives in services**
5. **Changes to shared contracts require updates in both frontend and backend imports**
