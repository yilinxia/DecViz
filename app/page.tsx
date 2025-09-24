"use client"

import { useState, useEffect, useLayoutEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import LogicaEditor from "@/components/logica-editor"
import { Label } from "@/components/ui/label"
import DotCommandRenderer from "@/components/dot-command-renderer"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { type Example } from "@/lib/examples"
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "@/lib/lz-string"
import { executeLogica } from "@/lib/logica-executor"
import Footer from "@/components/footer"
import HistoryPanel from "@/components/history-panel"
import { Sidebar, SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { ChevronLeft, ChevronRight, Share2, Scan } from "lucide-react"
import type { HistoryEntry } from "@/types/history"

const GitHubIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
    <path d="M9 18c-4.51 2-5-2-7-2"></path>
  </svg>
)

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="5,3 19,12 5,21" />
  </svg>
)

const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7,10 12,15 17,10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)


export default function DecVizApp() {
  const [selectedExample, setSelectedExample] = useState<string>("")
  const [domainLanguage, setDomainLanguage] = useState("")
  const [visualLanguage, setVisualLanguage] = useState("")
  const [examples, setExamples] = useState<Example[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [pyodideReady, setPyodideReady] = useState(false)
  const [graphvizOutput, setGraphvizOutput] = useState("")
  const [hasGeneratedGraph, setHasGeneratedGraph] = useState(false)
  const [showDotModal, setShowDotModal] = useState(false)
  const [showResultsModal, setShowResultsModal] = useState(false)
  const [logicaResults, setLogicaResults] = useState<any>(null)
  const [rawGraphResult, setRawGraphResult] = useState<string>("")
  const [rawNodeResult, setRawNodeResult] = useState<string>("")
  const [rawEdgeResult, setRawEdgeResult] = useState<string>("")
  const [graphStatus, setGraphStatus] = useState<string>("")
  const [nodeStatus, setNodeStatus] = useState<string>("")
  const [edgeStatus, setEdgeStatus] = useState<string>("")
  const [graphError, setGraphError] = useState<string>("")
  const [nodeError, setNodeError] = useState<string>("")
  const [edgeError, setEdgeError] = useState<string>("")
  const [rankingStatus, setRankingStatus] = useState<string>("")
  const [rankingError, setRankingError] = useState<string>("")
  const [lockedViewportHeight, setLockedViewportHeight] = useState<number | null>(null)
  const [dotCopied, setDotCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const { toast } = useToast()
  // Sidebar open state (to auto-open on shared links)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([])
  const [showCompareModal, setShowCompareModal] = useState(false)
  const [showDomainModal, setShowDomainModal] = useState(false)
  const [showVisualModal, setShowVisualModal] = useState(false)
  const isAnyModalOpen = showDomainModal || showVisualModal || showDotModal || showResultsModal || showCompareModal

  // Detect user's operating system for comment shortcut (client-side only)
  const [commentShortcut, setCommentShortcut] = useState('Ctrl+/') // Default fallback

  useEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    setCommentShortcut(isMac ? 'Cmd+/' : 'Ctrl+/')
  }, [])

  // Lock the layout to the initial viewport height on first mount
  useLayoutEffect(() => {
    if (typeof window !== 'undefined') {
      setLockedViewportHeight(window.innerHeight)
    }
  }, [])

  // Initialize global worker on mount
  // Initialize Pyodide on mount
  useEffect(() => {
    const initializePyodide = async () => {
      try {
        // console.log("🔄 Initializing Pyodide...")
        // Don't actually initialize here - let the executor handle it
        // Just set ready state to true
        setPyodideReady(true)
        // console.log("✅ Pyodide ready!")
      } catch (error) {
        console.error("❌ Failed to initialize Pyodide:", error)
        setPyodideReady(false)
      }
    }

    initializePyodide()
  }, [])

  // Load/save history from localStorage and import from share links
  useEffect(() => {
    ; (async () => {
      try {
        const saved = typeof window !== 'undefined' ? localStorage.getItem('decviz_history') : null
        let loadedFromLink = false
        if (typeof window !== 'undefined') {
          const params = new URLSearchParams(window.location.search)
          const s = params.get('s')
          const h = params.get('h')
          if (s) {
            loadedFromLink = true
            try {
              const resp = await fetch(`/api/share?id=${encodeURIComponent(s)}`)
              const data = await resp.json()
              if (data?.entries && Array.isArray(data.entries)) {
                setHistory(data.entries)
              }
            } catch { }
            const cleanUrl = window.location.origin + window.location.pathname
            window.history.replaceState({}, '', cleanUrl)
          } else if (h) {
            loadedFromLink = true
            try {
              // Try new compressed format first; fall back to legacy base64
              let decodedObj: any = null
              try {
                const decompressed = decompressFromEncodedURIComponent(decodeURIComponent(h))
                decodedObj = JSON.parse(decompressed)
              } catch {
                decodedObj = JSON.parse(atob(decodeURIComponent(h)))
              }
              if (decodedObj?.entries && Array.isArray(decodedObj.entries)) {
                setHistory(decodedObj.entries)
              }
              const cleanUrl = window.location.origin + window.location.pathname
              window.history.replaceState({}, '', cleanUrl)
            } catch { }
          }
        }
        if (!loadedFromLink && saved) {
          const parsed = JSON.parse(saved)
          if (Array.isArray(parsed)) setHistory(parsed)
        }
        if (loadedFromLink) {
          try {
            setSidebarOpen(true)
          } catch { }
        }
      } catch { }
    })()
  }, [])

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem('decviz_history', JSON.stringify(history))
      }
    } catch { }
  }, [history])

  // Load examples on component mount
  useEffect(() => {
    const loadExamplesData = async () => {
      try {
        // console.log("🔄 Loading examples from API...")
        const response = await fetch('/api/examples')

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        // console.log("📊 Received examples from API:", data.examples)
        setExamples(data.examples || [])
      } catch (error) {
        console.error("Failed to load examples:", error)
        toast({
          variant: "destructive",
          title: "Failed to load examples",
          description: "Could not load example files. Please refresh the page.",
        })
      }
    }

    loadExamplesData()
  }, [toast])

  const handleExampleChange = (exampleId: string) => {
    // console.log("📋 Example selected:", exampleId)

    const example = examples.find(ex => ex.id === exampleId)
    if (example) {
      // console.log("✅ Found example:", example)
      // console.log("📝 Setting domain language:", example.domainLanguage)
      // console.log("🎨 Setting visual language:", example.visualLanguage)

      setSelectedExample(exampleId)
      setDomainLanguage(example.domainLanguage)
      setVisualLanguage(example.visualLanguage)
      setHasGeneratedGraph(false) // Reset graph state when loading new example

      // console.log("✅ Example loaded successfully. Click 'Generate Graph' to create visualization.")
    } else {
      console.warn("⚠️ Example not found:", exampleId)
    }
  }

  const handleCommentToggle = (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, setValue: (value: string) => void) => {
    // console.log('🔍 Key pressed:', e.key, 'Ctrl:', e.ctrlKey, 'Meta:', e.metaKey)

    // Check for Ctrl+/ (Windows/Linux) or Cmd+/ (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      // console.log('✅ Comment shortcut triggered!')
      e.preventDefault()

      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const lines = value.split('\n')

      // console.log('📝 Selection:', { start, end, lines: lines.length })

      // Find which lines are selected
      let lineStart = 0
      let lineEnd = lines.length - 1

      // Calculate line positions
      let currentPos = 0
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length
        const lineEndPos = currentPos + lineLength

        if (start >= currentPos && start <= lineEndPos) {
          lineStart = i
        }
        if (end >= currentPos && end <= lineEndPos) {
          lineEnd = i
          break
        }

        currentPos = lineEndPos + 1 // +1 for newline character
      }

      // console.log('📊 Lines to comment:', { lineStart, lineEnd })

      // Toggle comments for selected lines
      const newLines = lines.map((line, index) => {
        if (index >= lineStart && index <= lineEnd) {
          const trimmedLine = line.trim()
          if (trimmedLine.startsWith('#')) {
            // Uncomment: remove # and any following space
            // console.log('🔄 Uncommenting line:', line)
            return line.replace(/^\s*#\s?/, '')
          } else if (trimmedLine.length > 0) {
            // Comment: add # and space
            // console.log('🔄 Commenting line:', line)
            return line.replace(/^(\s*)/, '$1# ')
          }
        }
        return line
      })

      const newValue = newLines.join('\n')
      // console.log('📝 New value:', newValue)
      setValue(newValue)

      // Restore cursor position
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start, end)
      }, 0)
    }
  }

  const generateGraphvizDirect = async (domain: string, visual: string) => {
    // console.log("📝 Input Domain Language:", domain)
    // console.log("🎨 Input Visual Language:", visual)

    if (!domain.trim()) {
      // console.log("⚠️ Domain language is empty")
      throw new Error("Domain language is empty. Please enter some Logica code in the Domain Language field.")
    }

    try {
      // console.log("🔍 Executing Logica with direct Pyodide...")

      // Execute Logica directly with Pyodide
      const results = await executeLogica(domain, visual)

      // console.log("🧩 Processed results:", results)

      // Compile to DOT
      const dot = compileToDot(results)

      // Render via existing endpoint
      const resp = await fetch('/api/dot-to-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dot }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.error || 'Failed to generate SVG')
      }
      setGraphvizOutput(dot)
      setLogicaResults(results)
      setHasGeneratedGraph(true)

      // Set raw results for debugging
      setRawGraphResult(JSON.stringify(results.graph))
      setRawNodeResult(JSON.stringify(results.nodes))
      setRawEdgeResult(JSON.stringify(results.edges))
      setGraphStatus("OK")
      setNodeStatus("OK")
      setEdgeStatus("OK")
      setRankingStatus("OK")
      setGraphError("")
      setNodeError("")
      setEdgeError("")
      setRankingError("")

      // Return for history recording
      return { dot, results }
    } catch (error: any) {
      console.error('❌ Error running direct Logica:', error)
      throw new Error(`Direct Logica execution failed: ${error.message}`)
    }
  }

  // Helper: column utilities
  const hasColumn = (cols: string[], name: string) => cols.includes(name)
  const getValue = (row: string[], cols: string[], name: string) => {
    const i = cols.indexOf(name)
    return i >= 0 ? row[i] : ''
  }

  // Build DOT from results (ported from API)
  const compileToDot = (results: any): string => {
    let dot = 'digraph G {\n'

    // Graph properties - all optional, only include if user provides them
    if (results.graph?.rows?.length) {
      const gRow = results.graph.rows[0]
      const gCols = results.graph.columns

      // Only include properties that exist in the columns and have values
      if (hasColumn(gCols, 'rankdir')) {
        const rankdir = getValue(gRow, gCols, 'rankdir')
        if (rankdir) dot += `  rankdir=${rankdir};\n`
      }
      // Prefer explicit layout, else map engine -> layout for renderer selection
      if (hasColumn(gCols, 'layout')) {
        const layout = getValue(gRow, gCols, 'layout')
        if (layout) dot += `  layout=${layout};\n`
      } else if (hasColumn(gCols, 'engine')) {
        const engine = getValue(gRow, gCols, 'engine')
        if (engine) dot += `  layout=${engine};\n`
      }
      // Additional DOT graph attributes
      if (hasColumn(gCols, 'bgcolor')) {
        const bgcolor = getValue(gRow, gCols, 'bgcolor')
        if (bgcolor) dot += `  bgcolor="${bgcolor}";\n`
      }
      if (hasColumn(gCols, 'fontname')) {
        const fontname = getValue(gRow, gCols, 'fontname')
        if (fontname) dot += `  fontname="${fontname}";\n`
      }
      if (hasColumn(gCols, 'fontsize')) {
        const fontsize = getValue(gRow, gCols, 'fontsize')
        if (fontsize) dot += `  fontsize=${fontsize};\n`
      }
      if (hasColumn(gCols, 'fontcolor')) {
        const fontcolor = getValue(gRow, gCols, 'fontcolor')
        if (fontcolor) dot += `  fontcolor="${fontcolor}";\n`
      }
      if (hasColumn(gCols, 'splines')) {
        const splines = getValue(gRow, gCols, 'splines')
        if (splines) dot += `  splines=${splines};\n`
      }
      if (hasColumn(gCols, 'overlap')) {
        const overlap = getValue(gRow, gCols, 'overlap')
        if (overlap) dot += `  overlap=${overlap};\n`
      }
      if (hasColumn(gCols, 'sep')) {
        const sep = getValue(gRow, gCols, 'sep')
        if (sep) dot += `  sep=${sep};\n`
      }
      if (hasColumn(gCols, 'margin')) {
        const margin = getValue(gRow, gCols, 'margin')
        if (margin) dot += `  margin=${margin};\n`
      }
      if (hasColumn(gCols, 'pad')) {
        const pad = getValue(gRow, gCols, 'pad')
        if (pad) dot += `  pad=${pad};\n`
      }
      if (hasColumn(gCols, 'dpi')) {
        const dpi = getValue(gRow, gCols, 'dpi')
        if (dpi) dot += `  dpi=${dpi};\n`
      }
      if (hasColumn(gCols, 'size')) {
        const size = getValue(gRow, gCols, 'size')
        if (size) dot += `  size="${size}";\n`
      }
      if (hasColumn(gCols, 'ratio')) {
        const ratio = getValue(gRow, gCols, 'ratio')
        if (ratio) dot += `  ratio=${ratio};\n`
      }
      if (hasColumn(gCols, 'concentrate')) {
        const concentrate = getValue(gRow, gCols, 'concentrate')
        if (concentrate) dot += `  concentrate=${concentrate};\n`
      }
      if (hasColumn(gCols, 'compound')) {
        const compound = getValue(gRow, gCols, 'compound')
        if (compound) dot += `  compound=${compound};\n`
      }
      if (hasColumn(gCols, 'nodesep')) {
        const nodesep = getValue(gRow, gCols, 'nodesep')
        if (nodesep) dot += `  nodesep=${nodesep};\n`
      }
      if (hasColumn(gCols, 'ranksep')) {
        const ranksep = getValue(gRow, gCols, 'ranksep')
        if (ranksep) dot += `  ranksep=${ranksep};\n`
      }
      if (hasColumn(gCols, 'esep')) {
        const esep = getValue(gRow, gCols, 'esep')
        if (esep) dot += `  esep=${esep};\n`
      }
      if (hasColumn(gCols, 'ordering')) {
        const ordering = getValue(gRow, gCols, 'ordering')
        if (ordering) dot += `  ordering=${ordering};\n`
      }
      if (hasColumn(gCols, 'outputorder')) {
        const outputorder = getValue(gRow, gCols, 'outputorder')
        if (outputorder) dot += `  outputorder=${outputorder};\n`
      }
      if (hasColumn(gCols, 'pack')) {
        const pack = getValue(gRow, gCols, 'pack')
        if (pack) dot += `  pack=${pack};\n`
      }
      if (hasColumn(gCols, 'packmode')) {
        const packmode = getValue(gRow, gCols, 'packmode')
        if (packmode) dot += `  packmode=${packmode};\n`
      }
      if (hasColumn(gCols, 'remincross')) {
        const remincross = getValue(gRow, gCols, 'remincross')
        if (remincross) dot += `  remincross=${remincross};\n`
      }
      if (hasColumn(gCols, 'searchsize')) {
        const searchsize = getValue(gRow, gCols, 'searchsize')
        if (searchsize) dot += `  searchsize=${searchsize};\n`
      }
      if (hasColumn(gCols, 'style')) {
        const style = getValue(gRow, gCols, 'style')
        if (style) dot += `  style="${style}";\n`
      }
      if (hasColumn(gCols, 'truecolor')) {
        const truecolor = getValue(gRow, gCols, 'truecolor')
        if (truecolor) dot += `  truecolor=${truecolor};\n`
      }
      if (hasColumn(gCols, 'viewport')) {
        const viewport = getValue(gRow, gCols, 'viewport')
        if (viewport) dot += `  viewport="${viewport}";\n`
      }
      if (hasColumn(gCols, 'xdotversion')) {
        const xdotversion = getValue(gRow, gCols, 'xdotversion')
        if (xdotversion) dot += `  xdotversion="${xdotversion}";\n`
      }
      // Handle explicit ranking (ranks attribute)
      if (hasColumn(gCols, 'ranks')) {
        const ranks = getValue(gRow, gCols, 'ranks')
        if (ranks) {
          // Parse ranks string like "same A B C; same D E F"
          const rankGroups = ranks.split(';').map(group => group.trim()).filter(group => group)
          rankGroups.forEach(group => {
            if (group.startsWith('same ')) {
              const nodes = group.substring(5).trim().split(/\s+/).filter(node => node)
              if (nodes.length > 0) {
                dot += `  {rank = same ${nodes.join(' ')}}\n`
              }
            } else if (group.startsWith('min ')) {
              const nodes = group.substring(4).trim().split(/\s+/).filter(node => node)
              if (nodes.length > 0) {
                dot += `  {rank = min ${nodes.join(' ')}}\n`
              }
            } else if (group.startsWith('max ')) {
              const nodes = group.substring(4).trim().split(/\s+/).filter(node => node)
              if (nodes.length > 0) {
                dot += `  {rank = max ${nodes.join(' ')}}\n`
              }
            }
          })
        }
      }
      // Note: id attribute is not standard DOT syntax, skipping it
    }
    // No fallback defaults - all graph attributes are optional

    // Extract common node attributes
    if (results.nodes?.rows?.length) {
      const nCols = results.nodes.columns
      const commonNodeAttrs = new Map<string, string>()
      const nodeSpecificAttrs = new Map<string, string[]>()

      // Collect all attributes for each node
      results.nodes.rows.forEach((r: string[]) => {
        const nodeId = getValue(r, nCols, 'node_id') || 'unknown'
        const attrs: string[] = []

        const attrMap: Record<string, string> = {}
        if (hasColumn(nCols, 'shape')) {
          const v = getValue(r, nCols, 'shape')
          if (v) attrMap.shape = `"${v}"`
        }
        if (hasColumn(nCols, 'border')) {
          const v = getValue(r, nCols, 'border')
          if (v) attrMap.style = `"${v}"`
        }
        if (hasColumn(nCols, 'fontsize')) {
          const v = getValue(r, nCols, 'fontsize')
          if (v) attrMap.fontsize = v
        }
        if (hasColumn(nCols, 'fontname')) {
          const v = getValue(r, nCols, 'fontname')
          if (v) attrMap.fontname = `"${v}"`
        }
        if (hasColumn(nCols, 'fixedsize')) {
          const v = getValue(r, nCols, 'fixedsize')
          if (v) attrMap.fixedsize = v === 'true' ? 'true' : v
        }
        if (hasColumn(nCols, 'width')) {
          const v = getValue(r, nCols, 'width')
          if (v) attrMap.width = v
        }
        if (hasColumn(nCols, 'height')) {
          const v = getValue(r, nCols, 'height')
          if (v) attrMap.height = v
        }
        if (hasColumn(nCols, 'color')) {
          const v = getValue(r, nCols, 'color')
          if (v) {
            // Keep color attributes per-node only; do not add to common map via allowedCommonKeys
            attrMap.fillcolor = `"${v}"`
            attrMap.style = attrMap.style || '"filled"'
          }
        }

        // Track common attributes (only allow shape, style, fontsize)
        const allowedCommonKeys = new Set(['shape', 'style', 'fontsize'])
        Object.entries(attrMap).forEach(([key, value]) => {
          if (!allowedCommonKeys.has(key)) return
          if (!commonNodeAttrs.has(key)) {
            commonNodeAttrs.set(key, value)
          } else if (commonNodeAttrs.get(key) !== value) {
            commonNodeAttrs.delete(key) // Not common
          }
        })

        // Store node-specific attributes
        const nodeAttrs: string[] = []
        if (hasColumn(nCols, 'label')) {
          const v = getValue(r, nCols, 'label')
          if (v) nodeAttrs.push(`label="${v}"`)
        }
        Object.entries(attrMap).forEach(([key, value]) => {
          if (!commonNodeAttrs.has(key) || commonNodeAttrs.get(key) !== value) {
            nodeAttrs.push(`${key}=${value}`)
          }
        })

        nodeSpecificAttrs.set(nodeId, nodeAttrs)
      })

      // Output common node attributes (shape, style, fontsize only)
      if (commonNodeAttrs.size > 0) {
        dot += '\n  node [\n'
        Array.from(commonNodeAttrs.entries()).forEach(([key, value]) => {
          if (key === 'shape' || key === 'style' || key === 'fontsize') {
            dot += `    ${key}=${value}\n`
          }
        })
        dot += '  ];\n'
      }

      // Re-process nodes to exclude common attributes
      const finalNodeAttrs = new Map<string, string[]>()
      results.nodes.rows.forEach((r: string[]) => {
        const nodeId = getValue(r, nCols, 'node_id') || 'unknown'
        const attrs: string[] = []

        if (hasColumn(nCols, 'label')) {
          const v = getValue(r, nCols, 'label')
          if (v) attrs.push(`label="${v}"`)
        }

        // Add non-common attributes
        if (hasColumn(nCols, 'shape')) {
          const v = getValue(r, nCols, 'shape')
          if (v && (!commonNodeAttrs.has('shape') || commonNodeAttrs.get('shape') !== `"${v}"`)) {
            attrs.push(`shape="${v}"`)
          }
        }
        if (hasColumn(nCols, 'border')) {
          const v = getValue(r, nCols, 'border')
          if (v && (!commonNodeAttrs.has('style') || commonNodeAttrs.get('style') !== `"${v}"`)) {
            attrs.push(`style="${v}"`)
          }
        }
        if (hasColumn(nCols, 'fontsize')) {
          const v = getValue(r, nCols, 'fontsize')
          if (v && (!commonNodeAttrs.has('fontsize') || commonNodeAttrs.get('fontsize') !== v)) {
            attrs.push(`fontsize="${v}"`)
          }
        }
        if (hasColumn(nCols, 'fontname')) {
          const v = getValue(r, nCols, 'fontname')
          if (v) attrs.push(`fontname="${v}"`)
        }
        if (hasColumn(nCols, 'fixedsize')) {
          const v = getValue(r, nCols, 'fixedsize')
          const normalizedV = v === 'true' ? 'true' : v
          if (v && (!commonNodeAttrs.has('fixedsize') || commonNodeAttrs.get('fixedsize') !== normalizedV)) {
            attrs.push(`fixedsize="${v}"`)
          }
        }
        if (hasColumn(nCols, 'width')) {
          const v = getValue(r, nCols, 'width')
          if (v && (!commonNodeAttrs.has('width') || commonNodeAttrs.get('width') !== v)) {
            attrs.push(`width="${v}"`)
          }
        }
        if (hasColumn(nCols, 'height')) {
          const v = getValue(r, nCols, 'height')
          if (v && (!commonNodeAttrs.has('height') || commonNodeAttrs.get('height') !== v)) {
            attrs.push(`height="${v}"`)
          }
        }
        if (hasColumn(nCols, 'color')) {
          const v = getValue(r, nCols, 'color')
          if (v) {
            // Never treat fillcolor/style as common; always keep per-node
            attrs.push(`fillcolor="${v}"`)
            if (!attrs.some(a => a.startsWith('style='))) {
              attrs.push(`style="filled"`)
            }
          }
        }

        finalNodeAttrs.set(nodeId, attrs)
      })

      // Output nodes
      dot += '\n'
      Array.from(finalNodeAttrs.entries()).forEach(([nodeId, attrs]) => {
        if (attrs.length > 0) {
          dot += `  "${nodeId}" [${attrs.join(', ')}];\n`
        } else {
          dot += `  "${nodeId}";\n`
        }
      })
    }

    // Edge attributes - NO aggregation, each edge keeps its own attributes
    if (results.edges?.rows?.length) {
      const eCols = results.edges.columns

      // Output edges directly without any aggregation
      dot += '\n'
      results.edges.rows.forEach((r: string[]) => {
        const s = getValue(r, eCols, 'source_id') || 'unknown'
        const t = getValue(r, eCols, 'target_id') || 'unknown'
        const attrs: string[] = []

        // Add all attributes individually for each edge
        if (hasColumn(eCols, 'color')) {
          const v = getValue(r, eCols, 'color')
          if (v) attrs.push(`color="${v}"`)
        }
        if (hasColumn(eCols, 'style')) {
          const v = getValue(r, eCols, 'style')
          if (v) attrs.push(`style="${v}"`)
        }
        if (hasColumn(eCols, 'dir')) {
          const v = getValue(r, eCols, 'dir')
          if (v) attrs.push(`dir="${v}"`)
        }
        if (hasColumn(eCols, 'arrowhead')) {
          const v = getValue(r, eCols, 'arrowhead')
          if (v) attrs.push(`arrowhead="${v}"`)
        }
        if (hasColumn(eCols, 'arrowtail')) {
          const v = getValue(r, eCols, 'arrowtail')
          if (v) attrs.push(`arrowtail="${v}"`)
        }
        if (hasColumn(eCols, 'label')) {
          const v = getValue(r, eCols, 'label')
          if (v) attrs.push(`label="${v}"`)
        }
        if (hasColumn(eCols, 'headlabel')) {
          const v = getValue(r, eCols, 'headlabel')
          if (v) attrs.push(`headlabel="${v}"`)
        }
        if (hasColumn(eCols, 'taillabel')) {
          const v = getValue(r, eCols, 'taillabel')
          if (v) attrs.push(`taillabel="${v}"`)
        }
        if (hasColumn(eCols, 'fontcolor')) {
          const v = getValue(r, eCols, 'fontcolor')
          if (v) attrs.push(`fontcolor="${v}"`)
        }

        if (attrs.length > 0) {
          dot += `  "${s}" -> "${t}" [${attrs.join(', ')}];\n`
        } else {
          dot += `  "${s}" -> "${t}";\n`
        }
      })
    }

    // Add ranking constraints from Ranking table
    if (results.ranking?.rows?.length) {
      const rCols = results.ranking.columns

      dot += '\n'
      results.ranking.rows.forEach((r: string[]) => {
        const len = getValue(r, rCols, 'len') || ''
        const samerank = getValue(r, rCols, 'samerank') || ''

        if (samerank) {
          // Parse the samerank list (could be JSON array, ARRAY_AGG output, or comma-separated)
          try {
            // Try JSON first
            const nodes = JSON.parse(samerank)
            if (Array.isArray(nodes) && nodes.length > 0) {
              // Clean up quoted strings (remove extra quotes)
              const cleanNodes = nodes.map(node => node.replace(/^"|"$/g, ''))
              dot += `  { rank=same; ${cleanNodes.join('; ')}; }\n`
            }
          } catch (e) {
            // Try parsing as Python list string (e.g., "['T', 'A']")
            try {
              const pythonListMatch = samerank.match(/\[(.*?)\]/)
              if (pythonListMatch) {
                const listContent = pythonListMatch[1]
                const nodes = listContent.split(',').map(n => n.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, '')).filter(n => n)
                if (nodes.length > 0) {
                  dot += `  { rank=same; ${nodes.join('; ')}; }\n`
                }
              }
            } catch (e2) {
              // If not Python list, try parsing as comma-separated values
              const nodes = samerank.split(',').map(n => n.trim()).filter(n => n)
              if (nodes.length > 0) {
                dot += `  { rank=same; ${nodes.join('; ')}; }\n`
              }
            }
          }
        }
      })
    }

    dot += '}'
    return dot
  }

  const generateGraphviz = async (domain: string, visual: string) => {
    // console.log("📝 Input Domain Language:", domain)
    // console.log("🎨 Input Visual Language:", visual)

    if (!domain.trim()) {
      // console.log("⚠️ Domain language is empty")
      throw new Error("Domain language is empty. Please enter some Logica code in the Domain Language field.")
    }

    if (!pyodideReady) {
      throw new Error("Pyodide not ready. Please wait a moment and try again.")
    }

    // Join program (engine is injected by worker)
    const program = `${domain}\n\n${visual}`
    const worker: Worker = (globalThis as any).globalWorker as Worker

    // Helper: parse HTML table returned by worker to {columns, rows}
    const parseAsciiTable = (text: string): { columns: string[]; rows: string[][] } => {
      const lines = (text || '').split('\n')
      let headerLine = ''
      let dataStartIndex = -1
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('|') && line.includes('|') && !line.startsWith('+')) {
          headerLine = line
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
      const columns = headerLine.replace(/^\||\|$/g, '').split('|').map(c => c.trim()).filter(Boolean)
      const dataLines = lines.slice(dataStartIndex).filter(l => {
        const t = l.trim()
        return t && !t.startsWith('+') && t.includes('|')
      })
      const rows = dataLines.map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      return { columns, rows }
    }

    const parseHtmlTable = (html: string): { columns: string[]; rows: string[][] } => {
      try {
        const parser = new DOMParser()
        const doc = parser.parseFromString(html, 'text/html')
        const table = doc.querySelector('table')
        if (!table) return parseAsciiTable(html)
        const headerCells = table.querySelectorAll('thead tr th, tr th')
        const columns: string[] = []
        headerCells.forEach((th) => columns.push((th.textContent || '').trim()))
        // Fallback if no thead
        if (columns.length === 0) {
          // Some tables omit thead; use first row cells as headers
          const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td')
          firstRowCells.forEach((cell) => columns.push((cell.textContent || '').trim()))
        }
        const rows: string[][] = []
        const allRows = table.querySelectorAll('tr')
        allRows.forEach((tr, idx) => {
          // Skip first row if we synthesized headers from it
          const tds = tr.querySelectorAll('td')
          if (tds.length > 0) {
            if (columns.length && idx === 0) {
              // If first row was used as header (td header case), skip pushing it as data
              const firstRowCells = table.querySelectorAll('tr:first-child th, tr:first-child td')
              if (firstRowCells.length === tds.length) return
            }
            rows.push(Array.from(tds).map((td) => (td.textContent || '').trim()))
          }
        })
        if (columns.length === 0 || rows.length === 0) {
          // Fallback to ASCII parser if HTML structure is not present
          const parsed = parseAsciiTable(html)
          if (parsed.columns.length || parsed.rows.length) return parsed
        }
        return { columns, rows }
      } catch {
        return parseAsciiTable(html)
      }
    }

    // Helper: run a predicate via worker
    type RunResult = { status: string; result: string; error?: string }
    const runPredicate = (predicate: string): Promise<RunResult> => {
      return new Promise((resolve, reject) => {
        const onMessage = (event: MessageEvent) => {
          const data = event.data
          if (data.get && data.get('type') === 'run_predicate' && data.get('predicate') === predicate) {
            worker.removeEventListener('message', onMessage as any)
            const status = data.get('status')
            const result = data.get('result')
            const error = data.get('error_message')
            // console.log(`📥 Worker response for ${predicate}:`, { status, sample: (result || '').toString().slice(0, 200), error })
            resolve({ status, result, error })
          }
        }
        const onError = (err: any) => {
          worker.removeEventListener('message', onMessage as any)
          reject(err)
        }
        worker.addEventListener('message', onMessage as any)
        worker.addEventListener('error', onError, { once: true })
        worker.postMessage({ type: 'run_predicate', predicate, program, hide_error: true })
      })
    }

    try {
      // Run predicates
      const [graphRes, nodeRes, edgeRes, rankingRes] = await Promise.all<RunResult>([
        runPredicate('Graph').catch(() => ({ status: 'error', result: '', error: 'Graph failed' })),
        runPredicate('Node').catch(() => ({ status: 'error', result: '', error: 'Node failed' })),
        runPredicate('Edge').catch(() => ({ status: 'error', result: '', error: 'Edge failed' })),
        runPredicate('Ranking').catch(() => ({ status: 'error', result: '', error: 'Ranking failed' })),
      ])

      // console.log('🔎 Worker results:', {
      //   graph: { status: graphRes.status, sample: (graphRes.result || '').toString().slice(0, 200), error: graphRes.error },
      //   node: { status: nodeRes.status, sample: (nodeRes.result || '').toString().slice(0, 200), error: nodeRes.error },
      //   edge: { status: edgeRes.status, sample: (edgeRes.result || '').toString().slice(0, 200), error: edgeRes.error },
      // })

      const results: any = {
        graph: graphRes.status === 'OK' ? parseHtmlTable(graphRes.result) : { columns: [], rows: [] },
        nodes: nodeRes.status === 'OK' ? parseHtmlTable(nodeRes.result) : { columns: [], rows: [] },
        edges: edgeRes.status === 'OK' ? parseHtmlTable(edgeRes.result) : { columns: [], rows: [] },
        ranking: rankingRes.status === 'OK' ? parseHtmlTable(rankingRes.result) : { columns: [], rows: [] },
      }
      setRawGraphResult(graphRes.result || '')
      setRawNodeResult(nodeRes.result || '')
      setRawEdgeResult(edgeRes.result || '')
      setGraphStatus(graphRes.status)
      setNodeStatus(nodeRes.status)
      setEdgeStatus(edgeRes.status)
      setGraphError(graphRes.error || '')
      setNodeError(nodeRes.error || '')
      setEdgeError(edgeRes.error || '')
      setRankingStatus(rankingRes.status)
      setRankingError(rankingRes.error || '')
      setRankingStatus(rankingRes.status)
      setRankingError(rankingRes.error || '')

      // console.log('🧩 Parsed results:', results)

      const dot = compileToDot(results)

      // Render via existing endpoint
      const resp = await fetch('/api/dot-to-svg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dot }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        throw new Error(err.error || 'Failed to generate SVG')
      }
      setGraphvizOutput(dot)
      setLogicaResults(results)
      setHasGeneratedGraph(true)

      // Return for history recording
      return { dot, results }
    } catch (error: any) {
      console.error('❌ Error running Logica via worker:', error)
      throw new Error(`Logica execution failed: ${error.message}`)
    }
    // Note: Don't terminate the global worker - reuse it
  }

  const handleRunQuery = async () => {
    // console.log("🚀 Generate Graph button clicked!")
    // console.log("📝 Current Domain Language:", domainLanguage)
    // console.log("🎨 Current Visual Language:", visualLanguage)

    setIsGenerating(true)

    try {
      // Add a small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 500))

      // console.log("⚙️ Calling generateGraphvizDirect function...")
      const result = await generateGraphvizDirect(domainLanguage, visualLanguage)
      // Record history on success
      if (result && result.dot) {
        // Determine if we should auto-open the history sidebar (first successful run only)
        let shouldAutoOpen = false
        try {
          if (typeof window !== 'undefined') {
            const alreadyShown = localStorage.getItem('decviz_sidebar_autoopen_done')
            if (!alreadyShown && history.length === 0) {
              shouldAutoOpen = true
            }
          }
        } catch { }

        const entry: HistoryEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          domainLanguage,
          visualLanguage,
          dot: result.dot,
        }
        setHistory((prev) => [...prev, entry])

        // Auto-open the sidebar once to introduce the panel
        if (shouldAutoOpen) {
          try {
            setSidebarOpen(true)
            localStorage.setItem('decviz_sidebar_autoopen_done', '1')
          } catch { }
        }
      }
      // Success toast removed per request
      // console.log("🎉 Graph generation completed")
    } catch (error: any) {
      console.error("❌ Error during graph generation:", error)

      // Check for specific error types and show appropriate messages
      if (error.message && error.message.includes('Logica execution failed')) {
        toast({
          variant: "destructive",
          title: "Logica Execution Error",
          description: "Failed to execute Logica code. Please check your syntax and ensure Logica is properly installed.",
        })
      } else if (error.message && error.message.includes('Domain language is empty')) {
        toast({
          variant: "destructive",
          title: "Empty Domain Language",
          description: "Please enter some Logica code in the Domain Language field.",
        })
      } else if (error.message && error.message.includes('No nodes found')) {
        toast({
          variant: "destructive",
          title: "Missing Node Predicates",
          description: "Please define node predicates like argument(\"a\"); or other single-argument predicates.",
        })
      } else if (error.message && error.message.includes('No edges found')) {
        toast({
          variant: "destructive",
          title: "Missing Edge Predicates",
          description: "Please define edge predicates like attacks(\"a\", \"b\");, edge(\"a\", \"b\");, or parent(\"a\", \"b\");",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Generation Failed",
          description: "Failed to generate the graph. Please check your input.",
        })
      }
    } finally {
      setIsGenerating(false)
      // console.log("🏁 Generation process finished, loading state cleared")
    }
  }

  // History selection handlers
  const toggleSelectHistory = (id: string) => {
    setSelectedHistoryIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      if (prev.length < 2) return [...prev, id]
      // Replace the first selected when already two selected
      return [prev[1], id]
    })
  }

  const clearHistory = () => {
    setHistory([])
    setSelectedHistoryIds([])
  }

  const openCompare = () => {
    if (selectedHistoryIds.length === 2) setShowCompareModal(true)
  }

  // Load a history run back into the workspace
  const handleLoadRun = (id: string) => {
    const entry = history.find((e) => e.id === id)
    if (!entry) return
    setDomainLanguage(entry.domainLanguage)
    setVisualLanguage(entry.visualLanguage)
    setGraphvizOutput(entry.dot)
    setHasGeneratedGraph(true)
    // Clear current errors/status when restoring
    setGraphStatus("")
    setNodeStatus("")
    setEdgeStatus("")
    setGraphError("")
    setNodeError("")
    setEdgeError("")
    // Ensure sidebar opens to show action feedback
    try { setSidebarOpen(true) } catch { }
  }

  // Delete a history run
  const handleDeleteRun = (id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id))
    setSelectedHistoryIds((prev) => prev.filter((x) => x !== id))
  }

  // Hover edge toggle for sidebar
  const EdgeSidebarToggle = () => {
    const { state, toggleSidebar } = useSidebar()
    const isOpen = state === 'expanded'
    return (
      <div className="fixed left-0 top-0 h-screen w-4 z-50 group">
        <button
          onClick={toggleSidebar}
          aria-label={isOpen ? 'Hide history panel' : 'Show history panel'}
          className="absolute top-1/2 -translate-y-1/2 left-1 opacity-100 transition-opacity bg-white border border-slate-300 shadow-sm rounded-full p-1 hover:bg-slate-50"
        >
          {isOpen ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      </div>
    )
  }

  const handleGitHub = () => {
    window.open('https://github.com/yilinxia/DecViz', '_blank', 'noopener,noreferrer')
  }

  const handleShareHistory = async () => {
    try {
      if (!history || history.length === 0) {
        toast({ title: "Nothing to share", description: "Your history is empty." })
        return
      }

      const payload = {
        app: "DecViz",
        version: 1,
        exportedAt: new Date().toISOString(),
        entries: history,
      }
      const json = JSON.stringify(payload)
      const baseUrl = typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : ''
      let shareLink = ''

      // Try to create a short id via KV first; if it fails, fall back to ?h= link
      try {
        const res = await fetch('/api/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        })
        if (res.ok) {
          const { id } = await res.json()
          if (id) shareLink = `${baseUrl}?s=${encodeURIComponent(id)}`
        }
      } catch { }
      if (!shareLink) {
        const compressed = encodeURIComponent(compressToEncodedURIComponent(json))
        shareLink = `${baseUrl}?h=${compressed}`
      }

      // Just copy to clipboard; no system share or dialogs
      try {
        await navigator.clipboard.writeText(shareLink)
      } catch {
        // If copy fails, place link in address bar as a fallback
        try { window.history.replaceState({}, '', shareLink) } catch { }
      }
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 2000)
      return
    } catch (e) {
      toast({ variant: "destructive", title: "Share failed", description: "Could not share history. Please try again." })
    }
  }

  const handleDownload = async () => {
    const svgElement = document.querySelector(".graphviz-container svg")
    if (svgElement) {
      const svgData = new XMLSerializer().serializeToString(svgElement)

      // Create canvas to convert SVG to PNG
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      const img = new window.Image()

      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" })
      const svgUrl = URL.createObjectURL(svgBlob)

      img.onload = () => {
        canvas.width = img.width
        canvas.height = img.height
        ctx?.drawImage(img, 0, 0)

        canvas.toBlob((blob) => {
          if (blob) {
            const pngUrl = URL.createObjectURL(blob)
            const downloadLink = document.createElement("a")
            downloadLink.href = pngUrl
            downloadLink.download = "decviz-graph.png"
            document.body.appendChild(downloadLink)
            downloadLink.click()
            document.body.removeChild(downloadLink)
            URL.revokeObjectURL(pngUrl)
          }
          URL.revokeObjectURL(svgUrl)
        }, "image/png")
      }

      img.src = svgUrl
    }
  }

  const handleDownloadDot = () => {
    const dotBlob = new Blob([graphvizOutput], { type: "text/plain;charset=utf-8" })
    const dotUrl = URL.createObjectURL(dotBlob)
    const downloadLink = document.createElement("a")
    downloadLink.href = dotUrl
    downloadLink.download = "decviz-graph.dot"
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
    URL.revokeObjectURL(dotUrl)

    toast({
      title: "DOT file downloaded!",
      description: "The Graphviz DOT file has been saved to your downloads.",
    })
  }

  // Component to display DataFrame-like tables
  const DataFrameTable = ({ title, data, status }: { title: string, data: any, status: string }) => {
    if (status !== 'OK' || !data?.rows?.length) {
      return (
        <div className="border rounded-lg p-3">
          <h3 className="font-semibold text-sm mb-1">{title}</h3>
          <p className="text-muted-foreground text-xs">No data available</p>
        </div>
      )
    }

    return (
      <div className="border rounded-lg p-3">
        {(() => {
          const t = (title || '').toLowerCase()
          const headerBg = t === 'graph' ? 'bg-blue-50' : t === 'node' ? 'bg-emerald-50' : t === 'edge' ? 'bg-amber-50' : 'bg-muted'
          const headerText = t === 'graph' ? 'text-blue-700' : t === 'node' ? 'text-emerald-700' : t === 'edge' ? 'text-amber-700' : 'text-slate-700'
          const accentBg = t === 'graph' ? 'bg-blue-200' : t === 'node' ? 'bg-emerald-200' : t === 'edge' ? 'bg-amber-200' : 'bg-slate-200'
          return (
            <>
              <div className={`h-1 rounded-t-md ${accentBg} mb-2`} />
              <h3 className={`font-semibold text-sm mb-2 ${headerText}`}>{title}</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full border-collapse table-fixed text-[12px] leading-5">
                  <thead>
                    <tr>
                      {data.columns.map((col: string, idx: number) => (
                        <th
                          key={idx}
                          className={`border px-2 py-1 text-left font-semibold text-[12px] sticky top-0 z-10 ${headerBg} ${headerText}`}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row: string[], rowIdx: number) => (
                      <tr key={rowIdx} className="odd:bg-white even:bg-slate-50 hover:bg-muted/50">
                        {row.map((cell: string, colIdx: number) => (
                          <td key={colIdx} className="border px-2 py-1 align-top">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {data.rows.length} row{data.rows.length !== 1 ? 's' : ''}, {data.columns.length} column{data.columns.length !== 1 ? 's' : ''}
              </p>
            </>
          )
        })()}
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen={false} open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <Sidebar side="left" collapsible="offcanvas" className="border-r border-slate-200 bg-white">
        <HistoryPanel
          entries={history}
          selectedIds={selectedHistoryIds}
          onToggleSelect={toggleSelectHistory}
          onClear={clearHistory}
          onCompare={openCompare}
          onEditAnnotation={(id, value) => {
            setHistory((prev) => prev.map((e) => e.id === id ? { ...e, annotation: value } : e))
          }}
          onLoad={handleLoadRun}
          onDelete={handleDeleteRun}
        />
      </Sidebar>
      <SidebarInset>
        <EdgeSidebarToggle />
        <div
          className="overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col"
          style={{ height: lockedViewportHeight ? `${lockedViewportHeight}px` : '100dvh' }}
        >
          {/* Enhanced Header */}
          <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-sm flex-shrink-0">
            <div className="mx-auto w-[96%] px-3 pl-8 py-4">
              <div className="flex items-center justify-between w-full">
                {/* Logo and Title */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label="Refresh"
                      onClick={() => window.location.reload()}
                      className="relative rounded-xl hover:cursor-pointer focus:outline-none focus:ring-0"
                    >
                      <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg">
                        <Image
                          src="/logo.png"
                          alt="DecViz Logo"
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </button>
                    <div>
                      <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
                        DecViz
                      </h1>
                      <p className="text-xs text-slate-500 font-medium">Purpose-Driven Graph Visualization via Declarative Transformation</p>
                    </div>
                  </div>

                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    onClick={handleShareHistory}
                    className="gap-2 h-12 px-4 rounded-xl border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 bg-white shadow-sm hover:shadow-sm transition-all duration-300 ease-in-out"
                  >
                    <Share2 className="w-4 h-4" />
                    {shareCopied ? 'Copied' : 'Share'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleGitHub}
                    className="gap-2 h-12 px-4 rounded-xl border-slate-200 hover:border-green-300 hover:bg-green-50 hover:text-green-700 bg-white shadow-sm hover:shadow-sm transition-all duration-300 ease-in-out"
                  >
                    <GitHubIcon />
                    GitHub
                  </Button>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <div className="mx-auto w-[96%] px-3 pl-8 py-6 flex-1 overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-hidden">
              {/* Left Panel - Code Editors */}
              <div className="lg:col-span-5 flex flex-col space-y-6 h-full min-h-0">
                {/* Domain Language Section */}
                <div className="h-[calc(50%-12px)] min-h-0 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-6 py-3 bg-gradient-to-r from-blue-100/40 via-blue-100/30 to-transparent border-b border-slate-200 flex-shrink-0 h-20 flex items-center">
                    <div className="flex items-center justify-between h-full w-full">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#66B2EE' }}></div>
                          <Label className="text-sm font-semibold text-slate-800">Domain Language</Label>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">Define your domain facts and relationships</p>
                      </div>

                      {/* Example Selector */}
                      <div className="ml-4">
                        <Select value={selectedExample} onValueChange={handleExampleChange}>
                          <SelectTrigger size="sm" className="w-auto min-w-0 h-8 px-2 rounded-md border-slate-200 bg-white transition-all duration-200 shadow-sm hover:bg-blue-100 hover:border-blue-300">
                            <SelectValue placeholder="Example">
                              {selectedExample ? examples.find(ex => ex.id === selectedExample)?.name : "Example"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-slate-200 shadow-xl">
                            {examples.map((example) => (
                              <SelectItem
                                key={example.id}
                                value={example.id}
                                className="rounded-md py-2 transition-all duration-200 hover:bg-green-100"
                              >
                                <span className="font-medium text-sm">{example.name}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-4 overflow-hidden">
                    <div className="h-full rounded-xl bg-slate-50/50 shadow-inner overflow-hidden relative">
                      <LogicaEditor
                        value={domainLanguage}
                        onChange={setDomainLanguage}
                        onKeyDown={(e) => handleCommentToggle(e, domainLanguage, setDomainLanguage)}
                        placeholder={`# Define your domain facts here
# Tip: Use Cmd+/ (Mac) or Ctrl+/ (Win/Linux) to toggle comments
Argument("a");
Argument("b");
Attacks("a", "b");
# This is a comment`}
                        className="w-full h-full rounded-xl"
                        style={{
                          minHeight: '200px',
                          maxHeight: '100%'
                        }}
                        spellCheck={false}
                        useOverlayHighlighting={false}
                      />
                      {/* Fullscreen Button */}
                      {!isAnyModalOpen && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowDomainModal(true)}
                          className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm hover:bg-blue-100 hover:border-blue-300 rounded-lg shadow-sm z-30 pointer-events-auto"
                        >
                          <Scan className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Visual Language Section */}
                <div className="h-[calc(50%-12px)] min-h-0 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                  <div className="px-6 py-3 bg-gradient-to-r from-green-100/40 via-green-100/30 to-transparent border-b border-slate-200 flex-shrink-0 h-20 flex items-center">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6BB56B' }}></div>
                        <Label className="text-sm font-semibold text-slate-800">Visual Language</Label>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">Configure visualization settings</p>
                    </div>
                  </div>
                  <div className="flex-1 p-4 overflow-hidden">
                    <div className="h-full rounded-xl bg-slate-50/50 shadow-inner overflow-hidden relative">
                      <LogicaEditor
                        value={visualLanguage}
                        onChange={setVisualLanguage}
                        onKeyDown={(e) => handleCommentToggle(e, visualLanguage, setVisualLanguage)}
                        placeholder={`# Tip: Use Cmd+/ (Mac) or Ctrl+/ (Win/Linux) to toggle comments
Node( node_id: x, label: \"x\", shape: \"circle\", border: \"solid\", fontsize: \"14\") :- Argument(x);
Edge(source_id: source, target_id: target, color: \"black\", style: \"solid\", arrowhead: \"normal\", arrowtail: \"\") :- Attacks(source, target);
# Configuration comments`}
                        className="w-full h-full rounded-xl"
                        style={{
                          minHeight: '200px',
                          maxHeight: '100%'
                        }}
                        spellCheck={false}
                        useOverlayHighlighting={false}
                      />
                      {/* Fullscreen Button */}
                      {!isAnyModalOpen && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowVisualModal(true)}
                          className="absolute bottom-3 right-3 bg-white/90 backdrop-blur-sm hover:bg-green-100 hover:border-green-300 rounded-lg shadow-sm z-30 pointer-events-auto"
                        >
                          <Scan className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Panel - Graph Visualization */}
              <div className="lg:col-span-7 h-full min-h-0 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
                <div className="px-6 py-3 bg-gradient-to-r from-yellow-100/40 via-yellow-100/30 to-transparent border-b border-slate-200 flex-shrink-0 h-20 flex items-center">
                  <div className="flex items-center justify-between w-full h-full">
                    <div className="flex flex-col space-y-0.5 flex-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isGenerating ? 'animate-pulse' : ''}`} style={{ backgroundColor: isGenerating ? '#EDD266' : '#EDD266' }}></div>
                        <Label className="text-sm font-semibold text-slate-800">Graph Visualization</Label>
                        {!pyodideReady && (
                          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                            Initializing...
                          </span>
                        )}
                        {isGenerating && (
                          <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                            Generating...
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {isGenerating ? 'Generating graph...' : 'Interactive graph with zoom and pan controls'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 h-full">
                      <Button
                        onClick={handleRunQuery}
                        disabled={isGenerating || !pyodideReady}
                        size="sm"
                        className="gap-2 h-8 px-3 rounded-lg text-white font-medium shadow-sm hover:shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{
                          background: 'linear-gradient(135deg, #66B2EE 0%, #6BB56B 50%, #EDD266 100%)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, #5BA3E8 0%, #5FA85F 50%, #E6C85C 100%)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(135deg, #66B2EE 0%, #6BB56B 50%, #EDD266 100%)'
                        }}
                      >
                        {isGenerating ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                            Generating...
                          </>
                        ) : (
                          <>
                            <PlayIcon />
                            Generate Graph
                          </>
                        )}
                      </Button>

                      <Dialog open={showResultsModal} onOpenChange={setShowResultsModal}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 h-8 px-3 rounded-lg border-slate-200 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 bg-white shadow-sm hover:shadow-sm transition-all duration-300 ease-in-out"
                          >
                            View Results
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                          <DialogHeader>
                            <DialogTitle>Logica Results (DataFrame View)</DialogTitle>
                          </DialogHeader>
                          <div className="mt-4 h-[60vh] overflow-auto space-y-4">
                            <DataFrameTable
                              title="Graph"
                              data={logicaResults?.graph}
                              status={graphStatus}
                            />
                            <DataFrameTable
                              title="Node"
                              data={logicaResults?.nodes}
                              status={nodeStatus}
                            />
                            <DataFrameTable
                              title="Edge"
                              data={logicaResults?.edges}
                              status={edgeStatus}
                            />
                            <DataFrameTable
                              title="Ranking"
                              data={logicaResults?.ranking}
                              status={rankingStatus}
                            />
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Dialog open={showDotModal} onOpenChange={setShowDotModal}>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 h-8 px-3 rounded-lg border-slate-200 hover:border-green-300 hover:bg-green-50 hover:text-green-700 bg-white shadow-sm hover:shadow-sm transition-all duration-300 ease-in-out"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14,2 14,8 20,8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                              <polyline points="10,9 9,9 8,9" />
                            </svg>
                            View DOT
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
                          <DialogHeader>
                            <DialogTitle>Generated DOT File</DialogTitle>
                          </DialogHeader>
                          <div className="mt-4 h-[60vh] overflow-auto">
                            <div className="bg-slate-50 rounded-lg border">
                              <div className="flex items-center justify-between p-3 border-b border-slate-200 bg-slate-100 rounded-t-lg">
                                <span className="text-sm font-medium text-slate-700">DOT Source Code</span>
                                <div className="flex items-center gap-2">
                                  <Button
                                    onClick={handleDownloadDot}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-7 px-3 hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                                  >
                                    <DownloadIcon />
                                    Download
                                  </Button>
                                  <Button
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(graphvizOutput)
                                        setDotCopied(true)
                                        setTimeout(() => setDotCopied(false), 2000)
                                      } catch (e) {
                                        // Optional: you could set an error state or silently fail
                                      }
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-7 px-3 hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                                  >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    {dotCopied ? 'Copied' : 'Copy'}
                                  </Button>
                                </div>
                              </div>
                              <pre className="p-4 text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[50vh]">
                                {graphvizOutput}
                              </pre>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      {/* Compare Dialog */}
                      <Dialog open={showCompareModal} onOpenChange={setShowCompareModal}>
                        <DialogContent className="w-[99vw] max-w-[98vw] h-[90vh] overflow-auto">
                          <DialogHeader>
                            <DialogTitle>Compare Runs</DialogTitle>
                          </DialogHeader>
                          {(() => {
                            const selectedEntries = selectedHistoryIds
                              .map((id) => history.find((e) => e.id === id))
                              .filter(Boolean) as HistoryEntry[]
                            if (selectedEntries.length !== 2) return (
                              <div className="p-4 text-sm text-slate-600">Select two records from the left panel to compare.</div>
                            )
                            let [a, b] = selectedEntries as [HistoryEntry, HistoryEntry]
                            // Ensure latest (newer timestamp) is on the right
                            if (a.timestamp > b.timestamp) {
                              const t = a; a = b; b = t
                            }
                            const renderSideBySide = (left: string, right: string) => {
                              const leftLines = (left || '').split('\n')
                              const rightLines = (right || '').split('\n')
                              const maxLen = Math.max(leftLines.length, rightLines.length)
                              const rows = [] as JSX.Element[]
                              for (let i = 0; i < maxLen; i++) {
                                const l = leftLines[i] ?? ''
                                const r = rightLines[i] ?? ''
                                const changed = l !== r
                                rows.push(
                                  <div key={i} className="grid grid-cols-2 gap-2">
                                    <pre className={`text-xs whitespace-pre-wrap p-2 rounded border ${changed ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-200'}`}>{l}</pre>
                                    <pre className={`text-xs whitespace-pre-wrap p-2 rounded border ${changed ? 'bg-yellow-50 border-yellow-200' : 'bg-slate-50 border-slate-200'}`}>{r}</pre>
                                  </div>
                                )
                              }
                              return <div className="space-y-1">{rows}</div>
                            }
                            const renderWholeWithDiff = (left: string, right: string) => {
                              const aLines = (left || '').split('\n')
                              const bLines = (right || '').split('\n')
                              const n = aLines.length
                              const m = bLines.length
                              const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
                              for (let i = n - 1; i >= 0; i--) {
                                for (let j = m - 1; j >= 0; j--) {
                                  if (aLines[i] === bLines[j]) dp[i][j] = 1 + dp[i + 1][j + 1]
                                  else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
                                }
                              }
                              const commonA = new Set<number>()
                              const commonB = new Set<number>()
                              let i = 0, j = 0
                              while (i < n && j < m) {
                                if (aLines[i] === bLines[j]) {
                                  commonA.add(i); commonB.add(j); i++; j++
                                } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
                                else j++
                              }
                              const renderBlock = (lines: string[], commons: Set<number>, addedColor: string) => (
                                <pre className="text-xs whitespace-pre-wrap p-2 rounded border bg-slate-50 border-slate-200 h-full overflow-auto">
                                  {lines.map((line, idx) => (
                                    <div key={idx} className={`${commons.has(idx) ? '' : addedColor} px-1 -mx-1 rounded`}>{line || ' '}</div>
                                  ))}
                                </pre>
                              )
                              return (
                                <div className="grid grid-cols-2 gap-2 h-[34vh]">
                                  {renderBlock(aLines, commonA, 'bg-red-50')}
                                  {renderBlock(bLines, commonB, 'bg-green-50')}
                                </div>
                              )
                            }
                            const getTitle = (e: HistoryEntry) => (e.annotation?.trim() || (e.domainLanguage.split('\n')[0] || 'Untitled'))
                            const annA = (a.annotation || '').trim()
                            const annB = (b.annotation || '').trim()
                            return (
                              <div className="mt-2">
                                <div className="grid grid-cols-2 gap-4">
                                  {/* Left column: Domain + Visual */}
                                  <div className="space-y-4">
                                    {/* Domain Language Comparison */}
                                    <div className="rounded-lg border border-slate-200 bg-white">
                                      <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-blue-50 rounded-t-lg text-sm font-semibold text-slate-800">
                                        Domain Language
                                      </div>
                                      <div className="p-3">
                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annA || undefined}>
                                            <span className="uppercase">Run A</span>
                                            {annA && <span>: {annA}</span>}
                                          </div>
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annB || undefined}>
                                            <span className="uppercase">Run B</span>
                                            {annB && <span>: {annB}</span>}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 h-[34vh]">
                                          <pre className="text-xs whitespace-pre-wrap p-2 rounded border bg-slate-50 border-slate-200 h-full overflow-auto">{a.domainLanguage}</pre>
                                          <pre className="text-xs whitespace-pre-wrap p-2 rounded border bg-slate-50 border-slate-200 h-full overflow-auto">{b.domainLanguage}</pre>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Visual Language Comparison */}
                                    <div className="rounded-lg border border-slate-200 bg-white">
                                      <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-purple-50 rounded-t-lg text-sm font-semibold text-slate-800">
                                        Visual Language
                                      </div>
                                      <div className="p-3">
                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annA || undefined}>
                                            <span className="uppercase">Run A</span>
                                            {annA && <span>: {annA}</span>}
                                          </div>
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annB || undefined}>
                                            <span className="uppercase">Run B</span>
                                            {annB && <span>: {annB}</span>}
                                          </div>
                                        </div>
                                        {renderWholeWithDiff(a.visualLanguage, b.visualLanguage)}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Right column: Graphs */}
                                  <div>
                                    <div className="rounded-lg border border-slate-200 bg-white">
                                      <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50 rounded-t-lg text-sm font-semibold text-slate-800">
                                        Graph Visualization
                                      </div>
                                      <div className="p-2">
                                        <div className="grid grid-cols-2 gap-2 mb-2 px-1">
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annA || undefined}>
                                            <span className="uppercase">Run A</span>
                                            {annA && <span>: {annA}</span>}
                                          </div>
                                          <div className="text-[11px] font-medium text-slate-700 truncate" title={annB || undefined}>
                                            <span className="uppercase">Run B</span>
                                            {annB && <span>: {annB}</span>}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 h-[78vh]">
                                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                                            <DotCommandRenderer dot={a.dot} className="h-full" />
                                          </div>
                                          <div className="border border-slate-200 rounded-lg overflow-hidden">
                                            <DotCommandRenderer dot={b.dot} className="h-full" />
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
                <div className="flex-1 p-4 overflow-auto">
                  <div className="h-full rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50/30 shadow-inner overflow-hidden">
                    <div className="graphviz-container h-full flex items-center justify-center">
                      {hasGeneratedGraph ? (
                        <DotCommandRenderer dot={graphvizOutput} className="h-full max-w-full relative" />
                      ) : (
                        <div className="text-center p-8">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                              <polygon points="13,2 3,14 12,14 11,22 21,10 12,10" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-slate-800 mb-2">Ready to Visualize</h3>
                          <p className="text-sm text-slate-600 mb-4">
                            Enter your domain language and visual language, then click "Generate Graph" to create your visualization.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Domain Language Fullscreen Modal */}
          <Dialog open={showDomainModal} onOpenChange={setShowDomainModal}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Domain Language Editor</DialogTitle>
              </DialogHeader>
              <div className="mt-4 h-[70vh] overflow-hidden">
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner overflow-hidden">
                  <LogicaEditor
                    value={domainLanguage}
                    onChange={setDomainLanguage}
                    onKeyDown={(e) => handleCommentToggle(e, domainLanguage, setDomainLanguage)}
                    placeholder={`# Define your domain facts here
# Tip: Use Cmd+/ (Mac) or Ctrl+/ (Win/Linux) to toggle comments
Argument("a");
Argument("b");
Attacks("a", "b");
# This is a comment`}
                    className="w-full h-full rounded-xl"
                    style={{
                      minHeight: '400px',
                      maxHeight: '100%'
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Visual Language Fullscreen Modal */}
          <Dialog open={showVisualModal} onOpenChange={setShowVisualModal}>
            <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Visual Language Editor</DialogTitle>
              </DialogHeader>
              <div className="mt-4 h-[70vh] overflow-hidden">
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner overflow-hidden">
                  <LogicaEditor
                    value={visualLanguage}
                    onChange={setVisualLanguage}
                    onKeyDown={(e) => handleCommentToggle(e, visualLanguage, setVisualLanguage)}
                    placeholder={`# Tip: Use Cmd+/ (Mac) or Ctrl+/ (Win/Linux) to toggle comments
Node( node_id: x, label: "x", shape: "circle", border: "solid", fontsize: "14") :- Argument(x);
Edge(source_id: source, target_id: target, color: "black", style: "solid", arrowhead: "normal", arrowtail: "") :- Attacks(source, target);
# Configuration comments`}
                    className="w-full h-full rounded-xl"
                    style={{
                      minHeight: '400px',
                      maxHeight: '100%'
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Footer />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
