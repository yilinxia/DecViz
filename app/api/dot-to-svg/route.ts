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

        console.log('🔄 API: Converting DOT to SVG using graphviz-cli')
        console.log('📝 API: DOT input:', dot.substring(0, 100) + '...')

        // Use graphviz-cli to generate SVG (pure JavaScript solution)
        const { stdout, stderr } = await execAsync(`echo '${dot.replace(/'/g, "'\\''")}' | npx graphviz-cli -Tsvg`)

        if (stderr) {
            console.error('❌ API: dot command stderr:', stderr)
            // Sometimes dot outputs warnings to stderr but still produces valid SVG
            if (!stdout || stdout.trim().length === 0) {
                return NextResponse.json(
                    { error: `dot command failed: ${stderr}` },
                    { status: 500 }
                )
            }
        }

        if (!stdout || stdout.trim().length === 0) {
            return NextResponse.json(
                { error: 'No SVG output from dot command' },
                { status: 500 }
            )
        }

        console.log('✅ API: SVG generated successfully, length:', stdout.length)
        console.log('📄 API: SVG preview:', stdout.substring(0, 200) + '...')

        return NextResponse.json({ svg: stdout })

    } catch (error) {
        console.error('❌ API: Error converting DOT to SVG:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to convert DOT to SVG' },
            { status: 500 }
        )
    }
}
