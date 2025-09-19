// Direct Pyodide Logica execution (no worker needed)
// This replaces the complex worker setup with direct Python execution

declare global {
    function loadPyodide(config: { indexURL: string }): Promise<any>;
}

let pyodideInstance: any = null;

export async function initializePyodide() {
    if (pyodideInstance) {
        return pyodideInstance;
    }

    // console.log('🔄 Loading Pyodide...');

    // Load Pyodide script dynamically if not already loaded
    if (typeof window !== 'undefined' && !(window as any).loadPyodide) {
        // console.log('📦 Loading Pyodide script...');
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/pyodide/v0.23.2/full/pyodide.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Check if loadPyodide is available
    if (typeof window === 'undefined' || !(window as any).loadPyodide) {
        throw new Error('Pyodide is not loaded. Please refresh the page and try again.');
    }

    // Load Pyodide directly
    const pyodide = await (window as any).loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.23.2/full/"
    });

    // console.log('📦 Installing packages...');

    // Install required packages
    await pyodide.loadPackage(['micropip']);
    const micropip = pyodide.pyimport('micropip');

    // Suppress micropip output during installation
    pyodide.runPython(`
import sys
from io import StringIO
sys.stdout = StringIO()
sys.stderr = StringIO()
`);

    await micropip.install(['logica', 'sqlite3', 'pandas']);

    // Restore stdout/stderr after installation
    pyodide.runPython(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
`);

    // console.log('✅ Pyodide initialized successfully');

    // Set up Logica execution functions
    pyodide.runPython(`
import sys
import io
from contextlib import redirect_stdout, redirect_stderr

# Suppress Python stdout/stderr to reduce console noise
class SuppressOutput:
    def write(self, x): pass
    def flush(self): pass

# Redirect stdout and stderr to suppress Pyodide package loading messages
sys.stdout = SuppressOutput()
sys.stderr = SuppressOutput()

import pandas as pd
import tempfile
import os
from logica.common import logica_lib

def execute_logica_predicate(program, predicate):
    """Execute Logica predicate and return pandas DataFrame"""
    try:
        # print(f"🔍 Running predicate '{predicate}'...")
        
        # Create temporary file for the program
        with tempfile.NamedTemporaryFile(mode='w', suffix='.l', delete=False) as f:
            f.write(program)
            temp_file = f.name
        
        try:
            # Use RunPredicateToPandas for cleaner execution
            df = logica_lib.RunPredicateToPandas(temp_file, predicate)
            # print(f"✅ Result: {len(df)} rows, columns: {list(df.columns)}")
            
            # Convert DataFrame to list of dictionaries for JSON serialization
            result = df.to_dict('records')
            return {"result": result, "status": "OK", "columns": list(df.columns)}
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file):
                os.unlink(temp_file)
                
    except Exception as e:
        # print(f"❌ Error: {str(e)}")
        return {"result": [], "error_message": str(e), "status": "error", "predicate_name": predicate}

def execute_multiple_predicates(program, predicates):
    """Execute multiple predicates and return structured results"""
    try:
        # print(f"🔍 Running predicates: {predicates}")
        
        # Create temporary file for the program
        with tempfile.NamedTemporaryFile(mode='w', suffix='.l', delete=False) as f:
            f.write(program)
            temp_file = f.name
        
        try:
            results = {}
            for predicate in predicates:
                try:
                    df = logica_lib.RunPredicateToPandas(temp_file, predicate)
                    results[predicate] = {
                        "data": df.to_dict('records'),
                        "columns": list(df.columns),
                        "status": "OK"
                    }
                    # print(f"✅ {predicate}: {len(df)} rows")
                except Exception as e:
                    # print(f"❌ Error with {predicate}: {str(e)}")
                    results[predicate] = {
                        "data": [],
                        "columns": [],
                        "status": "error",
                        "error": str(e)
                    }
            
            return {"results": results, "status": "OK"}
            
        finally:
            # Clean up temporary file
            if os.path.exists(temp_file):
                os.unlink(temp_file)
                
    except Exception as e:
        # print(f"❌ Multiple predicates error: {str(e)}")
        return {"results": {}, "error_message": str(e), "status": "error"}
`);

    pyodideInstance = pyodide;
    return pyodide;
}

export async function executeLogica(domainLanguage: string, visualLanguage: string) {
    try {
        const pyodide = await initializePyodide();

        // Join program with engine specification
        const program = `@Engine("sqlite");\n${domainLanguage}\n\n${visualLanguage}`;

        // console.log("🔍 Executing Logica with direct Pyodide...");
        // console.log("📝 Program:", program);

        // Execute multiple predicates
        const result = pyodide.runPython(`
execute_multiple_predicates("""${program.replace(/"/g, '\\"')}""", ['Graph', 'Node', 'Edge'])
`);

        // console.log("📊 Logica results:", result);

        // Convert PyProxy to JavaScript object
        const jsResult = result.toJs({ dict_converter: Object.fromEntries });
        // console.log("📊 Converted results:", jsResult);

        // Check if execution was successful
        if (jsResult.status !== 'OK') {
            throw new Error(jsResult.error_message || 'Logica execution failed');
        }

        // Process results - convert dictionary format to array format
        const convertToArrayFormat = (data: any[], columns: string[]) => {
            if (!data || !Array.isArray(data)) return [];
            return data.map(row => {
                if (Array.isArray(row)) return row; // Already in array format
                // Convert dictionary to array in column order
                return columns.map(col => row[col] || '');
            });
        };

        const processedResults = {
            graph: jsResult.results.Graph?.status === 'OK' ? {
                columns: jsResult.results.Graph.columns || [],
                rows: convertToArrayFormat(jsResult.results.Graph.data || [], jsResult.results.Graph.columns || [])
            } : { columns: [], rows: [] },
            nodes: jsResult.results.Node?.status === 'OK' ? {
                columns: jsResult.results.Node.columns || [],
                rows: convertToArrayFormat(jsResult.results.Node.data || [], jsResult.results.Node.columns || [])
            } : { columns: [], rows: [] },
            edges: jsResult.results.Edge?.status === 'OK' ? {
                columns: jsResult.results.Edge.columns || [],
                rows: convertToArrayFormat(jsResult.results.Edge.data || [], jsResult.results.Edge.columns || [])
            } : { columns: [], rows: [] }
        };

        return processedResults;
    } catch (error: any) {
        console.error('❌ Logica execution error:', error);
        throw new Error(`Failed to load Logica code: ${error.message}`);
    }
}
