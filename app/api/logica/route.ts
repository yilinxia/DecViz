import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// Helper function to parse Logica output with column names
function parseLogicaOutput(output: string): { columns: string[], rows: any[] } {
    const lines = output.split('\n')

    // Find the header line (contains column names)
    let headerLine = ''
    let dataStartIndex = -1

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('|') && line.includes('|') && !line.startsWith('+')) {
            // This is likely the header line
            headerLine = line
            // Find the next separator line to know where data starts
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].trim().startsWith('+')) {
                    dataStartIndex = j + 1
                    break
                }
            }
            break
        }
    }

    if (!headerLine || dataStartIndex === -1) return { columns: [], rows: [] }

    // Extract column names from header - remove leading/trailing pipes and split
    const columns = headerLine.replace(/^\||\|$/g, '').split('|').map(col => col.trim()).filter(col => col.length > 0)

    // Extract data lines (skip separator lines)
    const dataLines = lines.slice(dataStartIndex).filter(line => {
        const trimmed = line.trim()
        return trimmed && !trimmed.startsWith('+') && trimmed.includes('|')
    })

    if (dataLines.length === 0) return { columns, rows: [] }

    const rows = dataLines.map(line => {
        // Remove leading/trailing pipes and split by pipe
        const cleanLine = line.replace(/^\||\|$/g, '')
        return cleanLine.split('|').map(col => col.trim())
    }).filter(row => row.length > 0)

    return { columns, rows }
}

// Helper function to get value by column name
function getValueByColumn(row: any[], columns: string[], columnName: string): string {
    const index = columns.indexOf(columnName)
    return index >= 0 ? (row[index] || '') : ''
}

// Helper function to check if column exists
function hasColumn(columns: string[], columnName: string): boolean {
    return columns.includes(columnName)
}

// Compiler function to convert Logica results to Graphviz DOT
function compileToGraphviz(results: any): string {
    let dot = 'digraph G {\n'

    // Add graph properties from Graph table
    if (results.graph && results.graph.rows && results.graph.rows.length > 0) {
        const graphRow = results.graph.rows[0]
        const columns = results.graph.columns

        // Only include properties that exist in the columns
        if (hasColumn(columns, 'rankdir')) {
            const rankdir = getValueByColumn(graphRow, columns, 'rankdir')
            if (rankdir) dot += `  rankdir=${rankdir};\n`
        }
        // Note: layout attribute is not standard DOT syntax, skipping it
        // Note: id attribute is not standard DOT syntax, skipping it
    } else {
        // Default values only if no graph table exists
        dot += '  rankdir=TB;\n'
    }

    // Add nodes from Node table
    if (results.nodes && results.nodes.rows && results.nodes.rows.length > 0) {
        const columns = results.nodes.columns
        results.nodes.rows.forEach((nodeRow: any[]) => {
            const nodeId = getValueByColumn(nodeRow, columns, 'node_id') || 'unknown'

            // Build node attributes dynamically based on available columns
            const attrs = []

            if (hasColumn(columns, 'label')) {
                const label = getValueByColumn(nodeRow, columns, 'label')
                if (label) attrs.push(`label="${label}"`)
            }
            if (hasColumn(columns, 'shape')) {
                const shape = getValueByColumn(nodeRow, columns, 'shape')
                if (shape) attrs.push(`shape="${shape}"`)
            }
            if (hasColumn(columns, 'border')) {
                const border = getValueByColumn(nodeRow, columns, 'border')
                if (border) attrs.push(`style="${border}"`)
            }
            if (hasColumn(columns, 'fontsize')) {
                const fontsize = getValueByColumn(nodeRow, columns, 'fontsize')
                if (fontsize) attrs.push(`fontsize="${fontsize}"`)
            }
            if (hasColumn(columns, 'color')) {
                const color = getValueByColumn(nodeRow, columns, 'color')
                if (color) attrs.push(`fillcolor="${color}"`)
            }

            if (attrs.length > 0) {
                dot += `  "${nodeId}" [${attrs.join(', ')}];\n`
            } else {
                dot += `  "${nodeId}";\n`
            }
        })
        dot += '\n'
    }

    // Add edges from Edge table
    if (results.edges && results.edges.rows && results.edges.rows.length > 0) {
        const columns = results.edges.columns
        results.edges.rows.forEach((edgeRow: any[]) => {
            const sourceId = getValueByColumn(edgeRow, columns, 'source_id') || 'unknown'
            const targetId = getValueByColumn(edgeRow, columns, 'target_id') || 'unknown'

            // Build edge attributes dynamically based on available columns
            const attrs = []

            if (hasColumn(columns, 'color')) {
                const color = getValueByColumn(edgeRow, columns, 'color')
                if (color) attrs.push(`color="${color}"`)
            }
            if (hasColumn(columns, 'style')) {
                const style = getValueByColumn(edgeRow, columns, 'style')
                if (style) attrs.push(`style="${style}"`)
            }
            if (hasColumn(columns, 'arrowhead')) {
                const arrowhead = getValueByColumn(edgeRow, columns, 'arrowhead')
                if (arrowhead) attrs.push(`arrowhead="${arrowhead}"`)
            }
            if (hasColumn(columns, 'arrowtail')) {
                const arrowtail = getValueByColumn(edgeRow, columns, 'arrowtail')
                if (arrowtail) attrs.push(`arrowtail="${arrowtail}"`)
            }
            if (hasColumn(columns, 'label')) {
                const label = getValueByColumn(edgeRow, columns, 'label')
                if (label) attrs.push(`label="${label}"`)
            }

            let edgeDef = `  "${sourceId}" -> "${targetId}"`
            if (attrs.length > 0) {
                edgeDef += ` [${attrs.join(', ')}]`
            }
            edgeDef += ';\n'
            dot += edgeDef
        })
    }

    dot += '}'
    return dot
}

export async function POST(request: NextRequest) {
    try {
        const { domainLanguage, visualLanguage } = await request.json()

        if (!domainLanguage || !domainLanguage.trim()) {
            return NextResponse.json(
                { error: 'Domain language is required' },
                { status: 400 }
            )
        }

        // Create temporary Logica file
        // Filter out engine specifications that might cause parsing errors
        const cleanVisualLanguage = (visualLanguage || '').replace(/@Engine\([^)]+\);/g, '').trim()
        const logicaContent = `${domainLanguage}\n\n${cleanVisualLanguage}`
        const tempFilePath = path.join('/tmp', `decviz_${Date.now()}.l`)

        // Write to temporary file
        fs.writeFileSync(tempFilePath, logicaContent)
        console.log('📄 Created temporary Logica file:', tempFilePath)
        console.log('📝 Logica content:', logicaContent)

        // Verify the file was written correctly
        const fileContent = fs.readFileSync(tempFilePath, 'utf8')
        console.log('📖 File content verification:', fileContent)

        // Execute Logica to get all results using Python script with improved parsing
        const pythonScript = `
import subprocess
import json
import sys
import os

def parse_logica_output(output):
    """Parse Logica output and return structured data"""
    lines = output.strip().split('\\n')
    
    # Find header line
    header_line = None
    data_start = -1
    
    for i, line in enumerate(lines):
        line = line.strip()
        if line.startswith('|') and '|' in line and not line.startswith('+'):
            header_line = line
            # Find next separator line
            for j in range(i + 1, len(lines)):
                if lines[j].strip().startswith('+'):
                    data_start = j + 1
                    break
            break
    
    if not header_line or data_start == -1:
        return {"columns": [], "rows": []}
    
    # Extract column names - split by pipe and clean
    columns = [col.strip() for col in header_line.split('|') if col.strip()]
    
    # Extract data rows
    rows = []
    for line in lines[data_start:]:
        line = line.strip()
        if line and not line.startswith('+') and '|' in line:
            # Split by pipe and clean
            row = [col.strip() for col in line.split('|') if col.strip()]
            if row:
                rows.append(row)
    
    return {"columns": columns, "rows": rows}

def run_logica_command(logica_path, file_path, predicate):
    """Run Logica command and parse output"""
    try:
        result = subprocess.run([logica_path, file_path, 'run', predicate], 
                              capture_output=True, text=True, timeout=10)
        if result.returncode == 0:
            return parse_logica_output(result.stdout)
        else:
            return {"columns": [], "rows": []}
    except:
        return {"columns": [], "rows": []}

# Main execution
logica_path = '/opt/miniconda3/envs/decviz/bin/logica'
file_path = sys.argv[1]

results = {}

# Try Graph predicate (capitalized first, then lowercase)
graph_result = run_logica_command(logica_path, file_path, 'Graph')
if graph_result['rows']:
    results['graph'] = graph_result
else:
    graph_result = run_logica_command(logica_path, file_path, 'graph')
    results['graph'] = graph_result

# Try Node predicate (capitalized first, then lowercase)
node_result = run_logica_command(logica_path, file_path, 'Node')
if node_result['rows']:
    results['nodes'] = node_result
else:
    node_result = run_logica_command(logica_path, file_path, 'node')
    results['nodes'] = node_result

# Try Edge predicate (capitalized first, then lowercase)
edge_result = run_logica_command(logica_path, file_path, 'Edge')
if edge_result['rows']:
    results['edges'] = edge_result
else:
    edge_result = run_logica_command(logica_path, file_path, 'edge')
    results['edges'] = edge_result

print(json.dumps(results))
`

        // Write Python script to temporary file
        const pythonScriptPath = path.join('/tmp', `parse_logica_${Date.now()}.py`)
        fs.writeFileSync(pythonScriptPath, pythonScript)

        // Execute Python script using conda environment
        console.log('🐍 Executing Python script to parse Logica output...')
        const pythonResult = execSync(`/opt/miniconda3/envs/decviz/bin/python ${pythonScriptPath} ${tempFilePath}`, {
            encoding: 'utf8',
            timeout: 10000
        })

        const results = JSON.parse(pythonResult)

        // Check for Python errors
        if (results.error) {
            throw new Error(`Python execution failed: ${results.error}`)
        }

        console.log('📊 Parsed results:', results)

        // Clean up Python script
        fs.unlinkSync(pythonScriptPath)

        // Compile results to Graphviz DOT
        const graphvizDot = compileToGraphviz(results)
        console.log('🎨 Generated Graphviz DOT:', graphvizDot)

        // Clean up temporary file
        fs.unlinkSync(tempFilePath)
        console.log('🗑️ Cleaned up temporary file')

        // Always return the Logica results, even if empty
        return NextResponse.json({
            graphvizDot,
            logicaResults: results  // Always include the raw Logica results
        })

    } catch (error: any) {
        console.error('❌ Error in Logica API:', error)
        return NextResponse.json(
            { error: `Logica execution failed: ${error.message}` },
            { status: 500 }
        )
    }
}
