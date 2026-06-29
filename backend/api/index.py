"""
Vercel serverless entry point.
Vercel's Python runtime discovers this file via vercel.json and serves
the FastAPI ASGI app directly — no adapter (Mangum etc.) needed.
"""
from app.main import app  # noqa: F401  — Vercel imports `app` from here
