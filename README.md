# Udyam Sahayak

**Udyam Sahayak** (formerly Kisan Credit Copilot) is an offline-first, AI-assisted credit assessment platform designed for rural field officers evaluating SHGs, FPOs, and micro-enterprises.

Developed for the **NABARD Hackathon @ Global Fintech Fest 2026 (Track 03)**.

## Overview

Rural enterprises lack formal credit histories. This system combines physical ground-truth proxy data (like livestock count or floor area) with cluster-calibrated modeling (XGBoost) to forecast cash flows and flag risk early, empowering field officers without requiring persistent internet connectivity or advanced data science knowledge.

The architecture is explicitly designed around the RBI's draft Model Risk Management (MRM) guidance (June 2026):
- **Explainability:** All AI outputs use deterministic template engines, producing static, reproducible explanations without runtime LLMs.
- **Human Oversight:** The platform physically mandates officer confirmation or overrides (with reasons) before record finalization.
- **Auditability:** Immutability and cryptographic binding to officer JWTs ensure robust traceability.

## Repository Structure

- `/frontend` - React + Vite Progressive Web App (PWA) with IndexedDB for offline-first data capture and embedded JavaScript models (via `m2cgen`) for on-device inference.
- `/backend` - FastAPI Python backend backed by PostgreSQL/DuckDB, featuring robust RBAC, idempotent synchronization, and audit-ready data persistence.

## Getting Started

### Backend
1. Go to the `backend` directory.
2. Ensure you have Python 3.10+ installed.
3. Install dependencies: `pip install -e .[dev]` or via `requirements.txt`.
4. Initialize the DB: `python scripts/init_db.py`.
5. Run the server: `uvicorn app.main:app --reload`.

### Frontend
1. Go to the `frontend` directory.
2. Install dependencies: `npm install`.
3. Run the development server: `npm run dev`.

## Key Features

- **Idempotent Sync:** PWA aggressively caches drafts and syncs without duplicating entities upon network restoration.
- **On-Device Inference:** Ultra-low latency prediction using transpiled decision trees, requiring zero API calls to generate risk tiers.
- **Vernacular Design:** Target-specific audio and text elements optimized for intermittent connections, pulling only necessary regional caches.
- **Fraud Prevention:** Explicit bounds checking between self-reported data and model-inferred proxies.

## Documentation
Please refer to the enclosed markdown files in the root for in-depth documentation:
- `PRD_final.md`: Product Requirements Document
- `TRD_final.md`: Technical Requirements Document
- `UX_design_brief_final.md`: UX and Design Architecture
- `backend_schema_final.md`: Core SQL Models and APIs

## License
Confidential – Created for the NABARD Hackathon.
