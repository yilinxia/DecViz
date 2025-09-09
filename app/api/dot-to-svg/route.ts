import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'

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

        // Use graphviz-cli to generate SVG using spawn for better security and reliability
        const svg = await new Promise<string>((resolve, reject) => {
            const proc = spawn('./node_modules/.bin/graphviz', ['-Tsvg'])

            let output = ''
            let errorOutput = ''

            proc.stdout.on('data', (chunk) => (output += chunk.toString()))
            proc.stderr.on('data', (chunk) => (errorOutput += chunk.toString()))

            proc.on('close', (code) => {
                if (code === 0 && output.trim()) {
                    resolve(output)
                } else {
                    reject(new Error(errorOutput || 'Graphviz-cli failed'))
                }
            })

            proc.on('error', (error) => {
                reject(new Error(`Failed to start graphviz-cli: ${error.message}`))
            })

            // Write the DOT string to stdin
            proc.stdin.write(dot)
            proc.stdin.end()
        })

        console.log('✅ API: SVG generated successfully, length:', svg.length)
        console.log('📄 API: SVG preview:', svg.substring(0, 200) + '...')

        return NextResponse.json({ svg })

    } catch (error) {
        console.error('❌ API: Error converting DOT to SVG:', error)
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to convert DOT to SVG' },
            { status: 500 }
        )
    }
}
