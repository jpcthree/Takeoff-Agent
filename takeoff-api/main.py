"""
Takeoff Agent — FastAPI service wrapping the existing Python calculators,
PDF converter, and Excel exporter.
"""

import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Add the scripts directory to the Python path so we can import calculators
SCRIPTS_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    ".claude", "skills", "takeoff", "scripts",
)
if SCRIPTS_DIR not in sys.path:
    sys.path.insert(0, SCRIPTS_DIR)

# Also add the project root for config/ access
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from routers import pdf, export  # noqa: E402

app = FastAPI(
    title="Takeoff Agent API",
    description="Construction takeoff — PDF processing and Excel export",
    version="2.0.0",
)

# CORS — allow the Next.js frontend (local + production)
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://flowtakeoff.com",
        "https://www.flowtakeoff.com",
        *_extra_origins,
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf.router, prefix="/pdf", tags=["PDF"])
app.include_router(export.router, prefix="/export", tags=["Export"])


@app.get("/")
async def root():
    return {"service": "Takeoff Agent API", "version": "1.0.0", "status": "ok"}


@app.get("/health")
async def health():
    """Health check with env var diagnostics."""
    return {
        "status": "ok",
        "version": "1.0.1",
        "has_google_key": bool(os.environ.get("GOOGLE_API_KEY")),
        "has_attom_key": bool(os.environ.get("ATTOM_API_KEY")),
        "has_anthropic_key": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "has_rapidapi_key": bool(os.environ.get("RAPIDAPI_KEY")),
        "python_path_entries": len(sys.path),
    }



@app.get("/costs/default")
async def get_default_costs():
    """Return the default cost database."""
    import json

    costs_path = os.path.join(PROJECT_ROOT, "config", "default_costs.json")
    with open(costs_path) as f:
        return json.load(f)
