import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'
import crypto from 'crypto'

// In-memory fallback store for local/dev when KV is unavailable.
// Note: Ephemeral and process-bound; suitable only for development.
type MemoryRecord = { data: any; expiresAt: number }
const memoryStore = new Map<string, MemoryRecord>()
const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days for dev

function generateId(length: number = 12): string {
    // Use URL-safe base64; slice to requested length
    const raw = crypto.randomBytes(Math.ceil((length * 3) / 4)).toString('base64url')
    return raw.slice(0, length)
}

function memorySet(id: string, data: any, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000
    memoryStore.set(id, { data, expiresAt })
    setTimeout(() => {
        const rec = memoryStore.get(id)
        if (rec && rec.expiresAt <= Date.now()) memoryStore.delete(id)
    }, ttlSeconds * 1000 + 1000)
}

function memoryGet(id: string): any | null {
    const rec = memoryStore.get(id)
    if (!rec) return null
    if (Date.now() > rec.expiresAt) {
        memoryStore.delete(id)
        return null
    }
    return rec.data
}

// POST /api/share -> { id }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        if (!body || typeof body !== 'object' || !Array.isArray(body.entries)) {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        // Generate short id (longer for lower collision risk)
        const id = generateId(12)
        const key = `decviz:share:${id}`
        // Try KV (30 days TTL); fallback to in-memory dev store (7 days)
        try {
            await kv.set(key, body)
            await kv.expire(key, 60 * 60 * 24 * 30)
            return NextResponse.json({ id })
        } catch {
            memorySet(key, body, MEMORY_TTL_SECONDS)
            return NextResponse.json({ id })
        }
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
        try {
            const data = await kv.get(key)
            if (data) return NextResponse.json(data)
        } catch { }
        const mem = memoryGet(key)
        if (mem) return NextResponse.json(mem)
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Fetch failed' }, { status: 500 })
    }
}


