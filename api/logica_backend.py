from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from mangum import Mangum
import tempfile
import os
import subprocess
import sys
import re

app = FastAPI()

# Enable CORS for local dev and configurable deployments
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExecutePayload(BaseModel):
    domainLanguage: str
    visualLanguage: str | None = None


def _strip_outer_quotes(s: str) -> str:
    if len(s) >= 2 and ((s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'"))):
        return s[1:-1]
    return s

def _escape_for_dot(s: str) -> str:
    # Remove inner pairs like "X" inside the string (e.g., '"A"-2' -> 'A-2')
    s = re.sub(r'"([^"\\]*)"', r'\1', s)
    # Escape any remaining quotes and backslashes for DOT safety
    s = s.replace('\\', r'\\').replace('"', r'\"')
    return s


def run_logica_predicate(file_path: str, predicate: str) -> tuple[list[str], list[list[str]], str]:
    """Run Logica predicate using CLI and parse table output."""
    try:
        cmd = [sys.executable, '-m', 'logica', file_path, 'run_in_terminal', predicate]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        
        if proc.returncode != 0:
            return [], [], proc.stderr.strip()

        # Parse ASCII table output
        lines = [line.rstrip() for line in proc.stdout.splitlines()]
        
        # Find header line (starts with |, contains |, doesn't start with +)
        header_idx = -1
        for i, line in enumerate(lines):
            if line.strip().startswith('|') and '|' in line and not line.strip().startswith('+'):
                header_idx = i
                break
        
        if header_idx == -1:
            return [], [], 'No table header found'

        # Find separator line after header
        sep_idx = -1
        for j in range(header_idx + 1, len(lines)):
            if lines[j].strip().startswith('+'):
                sep_idx = j
                break
        
        if sep_idx == -1:
            return [], [], 'No table separator found'

        # Extract columns from header
        header_line = lines[header_idx].strip()
        columns = [col.strip() for col in header_line.strip('|').split('|') if col.strip()]

        # Extract data rows
        data_rows = []
        for k in range(sep_idx + 1, len(lines)):
            row_line = lines[k].strip()
            if not row_line or row_line.startswith('+') or '|' not in row_line:
                continue
            
            values = [val.strip() for val in row_line.strip('|').split('|')]
            # Clean quotes and escape for DOT
            values = [_escape_for_dot(_strip_outer_quotes(val)) for val in values]
            if values:
                data_rows.append(values)
        
        return columns, data_rows, ''
    except Exception as e:
        return [], [], str(e)


def execute_logica_program(program: str, predicates: list[str]) -> dict:
    """Execute Logica program and return results for specified predicates."""
    temp_dir = tempfile.mkdtemp(prefix="logica_")
    temp_file = os.path.join(temp_dir, "temp.l")
    
    try:
        # Write program to temp file
        with open(temp_file, "w") as f:
            f.write(program)

        results = {}
        for predicate in predicates:
            columns, rows, error = run_logica_predicate(temp_file, predicate)
            results[predicate] = {"columns": columns, "rows": rows}
            
            if error:
                print(f"Warning: {predicate} failed - {error}")
        
        return results
    finally:
        # Cleanup temp files
        try:
            if os.path.exists(temp_file):
                os.unlink(temp_file)
            if os.path.isdir(temp_dir):
                os.rmdir(temp_dir)
        except Exception:
            pass


def build_program(domain_language: str, visual_language: str | None) -> str:
    """Use the user's full @Engine(...) from domain if present (preserve clingo params). Default to sqlite otherwise. Strip all other @Engine occurrences."""
    import re
    engine_regex = r"@Engine\s*\([^)]*\)\s*;?\s*"

    # Full engine declaration from domain (preserve parameters)
    m = re.search(engine_regex, domain_language, flags=re.IGNORECASE)
    engine_decl_full = m.group(0).strip() if m else None

    # Clean both inputs (remove any @Engine occurrences)
    clean_domain = re.sub(engine_regex, "", domain_language, flags=re.IGNORECASE).strip()
    clean_visual = re.sub(engine_regex, "", visual_language or "", flags=re.IGNORECASE).strip()

    # If no domain engine, default to sqlite; otherwise, always use the user's full declaration
    header = engine_decl_full or '@Engine("sqlite");'

    parts = [header, clean_domain]
    if clean_visual:
        parts.append("")
        parts.append(clean_visual)
    return "\n".join(parts)


async def execute_logica(payload: ExecutePayload):
    """Execute Logica program and return results."""
    try:
        # Build program with engine declaration
        program = build_program(payload.domainLanguage, payload.visualLanguage)
        
        # Execute predicates
        tables = execute_logica_program(program, ["Graph", "Node", "Edge"])

        return JSONResponse({
            "status": "OK",
            "tables": tables,
            "graph": tables.get("Graph", {"columns": [], "rows": []}),
            "node": tables.get("Node", {"columns": [], "rows": []}),
            "edge": tables.get("Edge", {"columns": [], "rows": []}),
        })

    except Exception as e:
        return JSONResponse({
            "status": "error",
            "error": str(e)
        }, status_code=500)


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.post("/")
async def handler(payload: ExecutePayload):
    return await execute_logica(payload)


# Alias path to match frontend expectation
@app.post("/api/logica_backend")
async def handler_alias(payload: ExecutePayload):
    return await execute_logica(payload)


# Mangum handler for Vercel (only used in serverless environment)
mangum_handler = Mangum(app)