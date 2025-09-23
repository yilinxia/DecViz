#!/bin/bash

# Kill existing processes on ports 3000 and 8000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
lsof -ti:8000 | xargs kill -9 2>/dev/null || true

# Start backend in background (use absolute path to avoid directory issues)
(cd api && python -m uvicorn logica_backend:app --host 0.0.0.0 --port 8000 --reload) &

# Start frontend
npm run dev
