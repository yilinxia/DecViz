import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET(request: NextRequest) {
    try {
        const examplesDir = path.join(process.cwd(), 'examples')

        // Check if examples directory exists
        if (!fs.existsSync(examplesDir)) {
            return NextResponse.json({ examples: [] })
        }

        // Read all JSON files from examples directory
        const files = fs.readdirSync(examplesDir)
        const jsonFiles = files.filter(file => file.endsWith('.json'))

        console.log('📁 Found example files:', jsonFiles)

        const examples = []

        for (const filename of jsonFiles) {
            try {
                const filePath = path.join(examplesDir, filename)
                const fileContent = fs.readFileSync(filePath, 'utf8')
                const example = JSON.parse(fileContent)

                // Validate example structure
                if (example &&
                    typeof example.id === 'string' &&
                    typeof example.name === 'string' &&
                    typeof example.description === 'string' &&
                    typeof example.domainLanguage === 'string' &&
                    typeof example.visualLanguage === 'string') {
                    examples.push(example)
                    console.log(`✅ Loaded example: ${example.name}`)
                } else {
                    console.warn(`⚠️ Invalid example structure in ${filename}`)
                }
            } catch (error) {
                console.error(`❌ Error loading ${filename}:`, error)
            }
        }

        console.log(`📊 Total examples loaded: ${examples.length}`)
        return NextResponse.json({ examples })

    } catch (error) {
        console.error('❌ Error scanning examples directory:', error)
        return NextResponse.json(
            { error: 'Failed to load examples' },
            { status: 500 }
        )
    }
}
