# ABA Agent Starter

This is a minimal, local-first agentic development workflow to speed up building your ABA therapy web app.
It includes:
- **agent/**: Python orchestrator that plans tasks, generates code, opens PR branches, and runs tests.
- **app/**: React + Vite front-end scaffold with routes for Dashboard, Patients, Billing.
- **server/**: Node + Express API with Prisma (SQLite) schema for patients and invoices.
- **tests/**: Playwright tests for critical flows.
- **.github/workflows/**: Example nightly job to run tests and post a status comment.

> Note: You'll need your own API keys and to run this on your machine or CI. Review licenses and terms for any 3rd-party software you point the agent at. Keep it clean-room: replicate functionality, not code/assets.
