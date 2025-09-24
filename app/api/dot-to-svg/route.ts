import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
    try {
        const { dot } = await request.json()

        if (!dot || typeof dot !== 'string') {
            return NextResponse.json(
                { error: 'DOT string is required' },
                { status: 400 }
            )
        }

        // Detect layout/engine attribute to select engine (dot, neato, fdp, sfdp, twopi, circo)
        let engine = 'dot' // default engine
        const layoutMatch = dot.match(/\b(layout|engine)\s*=\s*(\w+)\s*;/)
        if (layoutMatch) {
            const layout = layoutMatch[2].toLowerCase()
            if (['dot', 'neato', 'fdp', 'sfdp', 'twopi', 'circo'].includes(layout)) {
                engine = layout
            }
        }

        // Use native Graphviz binary to convert DOT to SVG
        const { stdout, stderr } = await execAsync(`echo '${dot.replace(/'/g, "'\\''")}' | ${engine} -Tsvg`, {
            timeout: 10000, // 10 second timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        })

        if (stderr && !stderr.includes('Warning')) {
            console.error('Graphviz stderr:', stderr)
        }

        return NextResponse.json({ svg: stdout })

    } catch (error) {
        console.error('❌ API: Error converting DOT to SVG:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to convert DOT to SVG' },
            { status: 500 }
        )
    }
}
