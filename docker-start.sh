#!/bin/bash
cd /app
python -m uvicorn api.logica_backend:app --host 0.0.0.0 --port 8000 &
npx next start -p "${PORT:-3000}" --hostname 0.0.0.0
