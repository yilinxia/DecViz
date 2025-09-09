import { NextRequest, NextResponse } from 'next/server'
import { Graphviz } from '@hpcc-js/wasm'

export async function POST(request: NextRequest) {
    try {
        const { dot } = await request.json()

        if (!dot || typeof dot !== 'string') {
            return NextResponse.json(
                { error: 'DOT string is required' },
                { status: 400 }
            )
        }

        console.log('🔄 API: Converting DOT to SVG using @hpcc-js/wasm')
        console.log('📝 API: DOT input:', dot.substring(0, 100) + '...')

        // Use @hpcc-js/wasm for pure JavaScript/WASM graphviz rendering
        const graphviz = await Graphviz.load()
        const svg = graphviz.dot(dot)

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
