// Direct Pyodide Logica execution with clingo-wasm support
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

    // Install only packages that are available in Pyodide (avoid duckdb/clingo)
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
        # Temporarily disabled for debugging
        # sys.stdout = SuppressOutput()
        # sys.stderr = SuppressOutput()

        import pandas as pd
        import tempfile
        import os
        from logica.common import logica_lib

        # Check if clingo is available
        try:
            import clingo
            # print("✅ Clingo package is available")
            # print(f"📦 Clingo version: {clingo.__version__}")
            # print("🎉 RunClingo() functions should work!")
        except ImportError as e:
            # print(f"❌ Clingo package not available: {e}")
            # print("⚠️ RunClingo() functions will not work without clingo")
            # print("💡 Clingo is not available in Pyodide/browser environment")
            # print("💡 Consider using simpler Logica code without ASP features")
            pass

        # Check what packages are available
        # print("📦 Checking available packages...")
        try:
            import pkg_resources
            installed_packages = [d.project_name for d in pkg_resources.working_set]
            # print(f"📦 Installed packages: {installed_packages}")
        except:
            # print("⚠️ Could not list installed packages")
            pass

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
                # print(f"📝 Program preview (first 500 chars): {program[:500]}...")
                
                # Create temporary file for the program
                with tempfile.NamedTemporaryFile(mode='w', suffix='.l', delete=False) as f:
                    f.write(program)
                    temp_file = f.name
                
                try:
                    results = {}
                    for predicate in predicates:
                        try:
                            # print(f"🔍 Executing predicate: {predicate}")
                            df = logica_lib.RunPredicateToPandas(temp_file, predicate)
                            # print(f"✅ {predicate}: {len(df)} rows, columns: {list(df.columns)}")
                            results[predicate] = {
                                "data": df.to_dict('records'),
                                "columns": list(df.columns),
                                "status": "OK"
                            }
                        except Exception as e:
                            # print(f"❌ Error with {predicate}: {str(e)}")
                            results[predicate] = {
                                "data": [],
                                "columns": [],
                                "status": "error",
                                "error": str(e)
                            }
                    
                    # print(f"📊 Final results summary: {[(k, v['status'], len(v.get('data', []))) for k, v in results.items()]}")
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

        // Join program and handle engine specification intelligently
        // Extract any existing @Engine declarations from user input
        // Use a more comprehensive regex to catch all variations including complex parameters
        const engineRegex = /@Engine\s*\([^)]*\)\s*;?\s*/gi;

        let userEngine: string | null = null;

        // Function to clean engine declarations from text
        const cleanEngineDeclarations = (text: string): string => {
            return text.replace(engineRegex, '').trim();
        };

        // Extract engine from domain language - handle complex declarations
        const domainEngineMatch = domainLanguage.match(engineRegex);
        if (domainEngineMatch) {
            const engineDecl = domainEngineMatch[0];
            // Extract engine name from the declaration
            const engineNameMatch = engineDecl.match(/@Engine\s*\(\s*["']?([^"',\s]+)["']?/);
            if (engineNameMatch) {
                userEngine = engineNameMatch[1].trim();
            }
        }

        // Clean both inputs (strip any @Engine from both to prevent duplicates)
        // NOTE: We intentionally only honor engine declared in domainLanguage
        const cleanDomainLanguage = cleanEngineDeclarations(domainLanguage);
        const cleanVisualLanguage = cleanEngineDeclarations(visualLanguage);

        // Use user's engine if specified in domain language, otherwise default to sqlite
        // Only accept engines from domainLanguage; ignore any in visualLanguage
        const supportedEngines = ['sqlite'];
        let engineToUse = userEngine || 'sqlite';

        if (userEngine && !supportedEngines.includes(userEngine.toLowerCase())) {
            // console.warn(`⚠️ Engine '${userEngine}' is not supported in Pyodide. Falling back to 'sqlite'.`);
            engineToUse = 'sqlite';
        }

        const program = `@Engine("${engineToUse}");\n${cleanDomainLanguage}\n\n${cleanVisualLanguage}`;

        // console.log("🔍 Executing Logica with direct Pyodide...");
        // console.log("📝 Original domain:", domainLanguage);
        // console.log("📝 Original visual:", visualLanguage);
        // console.log("📝 Program:", program);
        // console.log(`🔧 Using engine: ${engineToUse}${userEngine ? ' (from user input)' : ' (default)'}`);
        // console.log("🧹 Cleaned domain:", cleanDomainLanguage);
        // console.log("🧹 Cleaned visual:", cleanVisualLanguage);

        // Check if the program uses RunClingo and warn early
        // if (program.includes('RunClingo(')) {
        //     console.log('⚠️ Detected RunClingo usage in program');
        //     console.log('💡 RunClingo() requires clingo package which is not available in Pyodide');
        //     console.log('💡 Consider using simpler Logica code without ASP features');
        // }

        // // Execute multiple predicates
        // console.log('🔍 Running Logica execution...');
        const result = pyodide.runPython(`
execute_multiple_predicates("""${program.replace(/"/g, '\\"')}""", ['Graph', 'Node', 'Edge'])
`);

        // console.log("📊 Logica results:", result);

        // Convert PyProxy to JavaScript object
        const jsResult = result.toJs({ dict_converter: Object.fromEntries });
        // console.log("📊 Raw Logica execution result:", jsResult);

        // Check if execution was successful
        if (jsResult.status !== 'OK') {
            console.error("❌ Logica execution failed:", jsResult.error_message);
            throw new Error(jsResult.error_message || 'Logica execution failed');
        }

        // Log detailed results for debugging
        // console.log("📊 Detailed results:", {
        //     Graph: jsResult.results?.Graph,
        //     Node: jsResult.results?.Node,
        //     Edge: jsResult.results?.Edge
        // });

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

        // Provide more specific error messages
        if (error.message.includes('Could not parse predicate call')) {
            throw new Error('Logica syntax error: Could not parse predicate call. Please check your Logica syntax and ensure all predicates are properly formatted.');
        } else if (error.message.includes('Single @Engine must be provided')) {
            throw new Error('Engine conflict: Multiple @Engine declarations found. Please ensure only one @Engine is specified.');
        } else if (error.message.includes('ParsingException')) {
            throw new Error('Logica parsing error: Please check your syntax. Common issues include missing semicolons, incorrect predicate formatting, or invalid characters.');
        } else if (error.message.includes('Engine') && error.message.includes('not supported')) {
            throw new Error(`Engine error: The specified engine may not be supported in this environment. Try using 'sqlite' or 'duckdb'.`);
        } else if (error.message.includes('duckdb') || error.message.includes('Can\'t find a pure Python 3 wheel')) {
            throw new Error('Engine not supported: DuckDB and other engines are not available in the browser environment. Please use @Engine("sqlite") instead.');
        } else if (error.message.includes('RunClingo') || error.message.includes('clingo')) {
            throw new Error('Clingo/ASP features not supported: RunClingo() and Answer Set Programming features are not available in the browser environment. Please use simpler Logica code without ASP constructs.');
        } else {
            throw new Error(`Failed to load Logica code: ${error.message}`);
        }
    }
}
