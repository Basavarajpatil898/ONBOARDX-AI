# ONBOARDX AI

ONBOARDX AI is a role-based employee onboarding workspace. Administrators create employee accounts, define job roles and skill requirements, publish learning modules and assessments, and review recorded progress. Employees complete learning, take assessments, browse practical exercises, and ask questions about published company guidance.

## Run locally

Requirements: Python 3.11+, Node.js 20+, and PostgreSQL.

1. Create a PostgreSQL database and copy `.env.example` to `backend/.env`.
2. Set `DATABASE_URL`, a unique `JWT_SECRET`, and both `ONBOARDX_ADMIN_EMAIL` and `ONBOARDX_ADMIN_PASSWORD`. The admin password must be at least 12 characters. Set `GEMINI_API_KEY` to enable document indexing and AI answers.
3. In PowerShell, install backend dependencies and start the API:

   ```powershell
   cd backend
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
   ```

4. In another terminal, start the frontend:

   ```powershell
   cd frontend
   npm ci
   npm run dev
   ```

5. Open <http://127.0.0.1:5173>. The development server proxies `/api` to `127.0.0.1:8001`.

## Production configuration

- Set `APP_ENV=production`, a unique `JWT_SECRET` with at least 32 characters, a production PostgreSQL `DATABASE_URL`, and the exact trusted browser origins in `FRONTEND_ORIGINS` (no localhost origins).
- Configure `ONBOARDX_ADMIN_EMAIL` and `ONBOARDX_ADMIN_PASSWORD` through the deployment secret manager. The configured password is applied to that admin account when the API starts.
- Set `GEMINI_API_KEY` if using AI answers and document indexing. The assistant uses Gemini 3.8 Flash and Google Search grounding for current questions, with web citations shown in chat. Set `GEMINI_WEB_SEARCH_ENABLED=false` to disable web search. Without a Gemini key, AI answers and document indexing are unavailable; onboarding and assessments continue to work.
- Build with `npm ci` and `npm run build`. Serve `frontend/dist` over HTTPS and route `/api` to the FastAPI service, or set `VITE_API_URL` to the API origin before building.
- Back up PostgreSQL and protect uploaded company documents and employee data. Never commit `.env` files or real credentials.

## Current deployment limits

The backend creates missing tables at startup with SQLAlchemy `create_all`; it does not yet include versioned schema migrations. Before deploying schema changes or relying on automated upgrades, add and run a migration workflow (for example, Alembic) and test restore procedures. Production readiness also depends on the hosting provider’s TLS, secrets, database backups, monitoring, and access controls.

Demo team rows are shown only in the Vite development build and are never stored as employee records.
