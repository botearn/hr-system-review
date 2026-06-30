# Contributing

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Useful commands:

```bash
npm run lint
npm run format
npm run format:check
npm run typecheck
npm run build
```

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

Useful commands:

```bash
ruff format .
ruff check .
pytest
```

## Code standards (high level)

- Keep changes small and reviewable.
- Prefer clear names over cleverness.
- Handle errors explicitly; don’t swallow exceptions.
- Do not add secrets (keys, tokens, `.env`) to git.

## API conventions

- Backend endpoints live under `backend/app/api/v1/`.
- Prefer Pydantic request/response schemas under `backend/app/schemas/`.
- Prefer SQLAlchemy ORM for most queries; use raw SQL only when necessary and keep table names consistent with models/migrations.

## Frontend conventions

- Pages live under `frontend/src/pages/`, shared components under `frontend/src/components/`.
- Keep UI state local when possible; promote to store only when cross-page.
- Keep async calls inside `frontend/src/api/*` modules; components should call those APIs.

## Commit messages

Follow existing style in the repo (examples):

- `feat(dashboard): ...`
- `fix(agent): ...`
- `chore(ui): ...`

## PR checklist

- [ ] `npm run lint && npm run typecheck` (frontend)
- [ ] `ruff format . && ruff check .` (backend)
- [ ] Confirm no secrets were added
- [ ] Add/adjust docs if behavior changed

