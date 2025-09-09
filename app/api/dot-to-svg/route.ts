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

        // Detect layout/engine attribute to select engine (dot, neato, fdp, sfdp, twopi, circo)
        // Examples: layout=neato; or engine=neato;
        let engine: any = undefined
        const layoutMatch = dot.match(/\b(layout|engine)\s*=\s*(\w+)\s*;/)
        if (layoutMatch) {
            const layout = layoutMatch[2].toLowerCase()
            switch (layout) {
                case 'dot':
                    engine = graphviz.layout.dot
                    break
                case 'neato':
                    engine = graphviz.layout.neato
                    break
                case 'fdp':
                    engine = graphviz.layout.fdp
                    break
                case 'sfdp':
                    engine = graphviz.layout.sfdp
                    break
                case 'twopi':
                    engine = graphviz.layout.twopi
                    break
                case 'circo':
                    engine = graphviz.layout.circo
                    break
            }
        }

        // Render SVG; if engine is available, use it, otherwise default
        const svg = engine ? graphviz.layout(dot, 'svg', engine) : graphviz.dot(dot)

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
