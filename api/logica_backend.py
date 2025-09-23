from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import tempfile
import os
import pandas as pd
import subprocess
import sys
import re

# Import logica library
from logica.common import logica_lib

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


def run_via_cli_and_parse(file_path: str, predicate: str, alt_order: bool = False, use_bin: bool = False) -> tuple[list[str], list[list[str]], str]:
    """Invoke Logica CLI to run_in_terminal and parse table output.
    Returns (columns, rows, stderr) or ([], [], err) if it fails.
    """
    try:
        if use_bin:
            # Use logica binary on PATH
            cmd = ['logica', file_path, 'run_in_terminal', predicate] if alt_order else ['logica', 'run_in_terminal', file_path, predicate]
        else:
            # Use python -m logica
            cmd = [sys.executable, '-m', 'logica', file_path, 'run_in_terminal', predicate] if alt_order else [sys.executable, '-m', 'logica', 'run_in_terminal', file_path, predicate]

        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=120)
        if proc.returncode != 0:
            return [], [], proc.stderr.strip()

        output = proc.stdout
        # Parse ASCII table
        lines = [ln.rstrip() for ln in output.splitlines()]
        header_idx = -1
        sep_idx = -1
        for i, ln in enumerate(lines):
            st = ln.strip()
            if st.startswith('|') and '|' in st and not st.startswith('+'):
                header_idx = i
                for j in range(i + 1, len(lines)):
                    if lines[j].strip().startswith('+'):
                        sep_idx = j
                        break
                break
        if header_idx == -1 or sep_idx == -1:
            return [], [], ''

        header_line = lines[header_idx].strip()
        columns = [c.strip() for c in header_line.strip('|').split('|') if c.strip()]

        data_rows: list[list[str]] = []
        for k in range(sep_idx + 1, len(lines)):
            row_line = lines[k].strip()
            if not row_line or row_line.startswith('+') or '|' not in row_line:
                continue
            values = [c.strip() for c in row_line.strip('|').split('|')]
            # Clean enclosing quotes from each value, then escape for DOT
            values = [_escape_for_dot(_strip_outer_quotes(v)) for v in values]
            if values:
                data_rows.append(values)
        return columns, data_rows, ''
    except Exception as e:
        return [], [], str(e)


def run_predicates(program: str, predicates: list[str]) -> dict:
    """Execute predicates with Logica and return tables as {columns, rows}."""
    # Write program to a stable temp file name temp.l inside a temp dir
    temp_dir = tempfile.mkdtemp(prefix="logica_")
    temp_file = os.path.join(temp_dir, "temp.l")
    try:
        with open(temp_file, "w") as f:
            f.write(program)

        results: dict[str, dict] = {}
        uses_clingo = 'RunClingo(' in program
        last_err = ''

        for predicate in predicates:
            # Try CLI in multiple invocation forms
            cols, rows, err = run_via_cli_and_parse(temp_file, predicate)
            if not rows:
                cols, rows, err = run_via_cli_and_parse(temp_file, predicate, alt_order=True)
            if not rows:
                cols, rows, err = run_via_cli_and_parse(temp_file, predicate, use_bin=True)

            if (not rows) and not uses_clingo:
                # Fallback to Python API only for non-ASP programs
                df: pd.DataFrame = logica_lib.RunPredicateToPandas(temp_file, predicate)
                cols = list(df.columns)
                rows = [list(row) for row in df.itertuples(index=False, name=None)]

            if not rows and err:
                last_err = err

            results[predicate] = {"columns": cols or [], "rows": rows or []}

        if uses_clingo and all(len(v.get('rows', [])) == 0 for v in results.values()):
            raise RuntimeError(f"Logica CLI failed. {last_err}".strip())

        return results

    finally:
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


@app.post("/")
async def handler(payload: ExecutePayload):
    try:
        # Build a single Logica program, honoring domain @Engine or default sqlite
        program = build_program(payload.domainLanguage, payload.visualLanguage)
        # Execute Graph, Node, Edge via Python Logica (supports clingo & duckdb in server env)
        tables = run_predicates(program, ["Graph", "Node", "Edge"])

        # Expose as separate tables too (graph, node, edge)
        graph_tbl = tables.get("Graph", {"columns": [], "rows": []})
        node_tbl = tables.get("Node", {"columns": [], "rows": []})
        edge_tbl = tables.get("Edge", {"columns": [], "rows": []})
        
        print(node_tbl)

        return JSONResponse({
            "status": "OK",
            "tables": tables,
            "graph": graph_tbl,
            "node": node_tbl,
            "edge": edge_tbl,
        })

    except Exception as e:
        return JSONResponse({
            "status": "error",
            "error": str(e)
        }, status_code=500)


# Alias path to match frontend expectation
@app.post("/api/logica_backend")
async def handler_alias(payload: ExecutePayload):
    return await handler(payload)


