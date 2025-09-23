// Backend-only Logica execution. Sends domain/visual language to the backend
// which runs Python Logica (with optional Clingo/DuckDB) and returns tables.

export async function executeLogica(domainLanguage: string, visualLanguage: string) {
    try {
        const base = (typeof process !== 'undefined' && (process as any).env && (process as any).env.NEXT_PUBLIC_LOGICA_BACKEND_URL) || ''
        const url = base ? `${base.replace(/\/$/, '')}/api/logica_backend` : '/api/logica_backend'

        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ domainLanguage, visualLanguage })
        });
        const data = await res.json();
        if (!res.ok || data.status !== 'OK') {
            throw new Error(data.error || 'Backend Logica execution failed');
        }

        const tables = data.tables || {};
        const graph = tables.Graph || data.graph || { columns: [], rows: [] };
        const nodes = tables.Node || data.node || { columns: [], rows: [] };
        const edges = tables.Edge || data.edge || { columns: [], rows: [] };

        return { graph, nodes, edges };
    } catch (error: any) {
        // Keep a single concise error path
        throw new Error(`Failed to load Logica code: ${error.message}`);
    }
}
