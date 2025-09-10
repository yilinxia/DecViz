import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// POST /api/share -> { id }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        // Generate short id
        const id = Math.random().toString(36).slice(2, 10)
        const key = `decviz:share:${id}`
        // Store for 30 days
        await kv.set(key, body)
        await kv.expire(key, 60 * 60 * 24 * 30)

        return NextResponse.json({ id })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Share failed' }, { status: 500 })
    }
}

// GET /api/share/:id -> payload
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
        const key = `decviz:share:${id}`
        const data = await kv.get(key)
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status: 500 })
    }
}


