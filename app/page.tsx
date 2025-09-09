"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import DotCommandRenderer from "@/components/dot-command-renderer"
import { useToast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { type Example } from "@/lib/examples"
import Footer from "@/components/footer"

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


export default function LogicaEditor() {
  const [selectedExample, setSelectedExample] = useState<string>("")
  const [domainLanguage, setDomainLanguage] = useState("")
  const [visualLanguage, setVisualLanguage] = useState("")
  const [examples, setExamples] = useState<Example[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [graphvizOutput, setGraphvizOutput] = useState("")
  const [hasGeneratedGraph, setHasGeneratedGraph] = useState(false)
  const [showDotModal, setShowDotModal] = useState(false)
  const [logicaResults, setLogicaResults] = useState<any>(null)
  const { toast } = useToast()

  // Detect user's operating system for comment shortcut (client-side only)
  const [commentShortcut, setCommentShortcut] = useState('Ctrl+/') // Default fallback

  useEffect(() => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    setCommentShortcut(isMac ? 'Cmd+/' : 'Ctrl+/')
  }, [])

  // Load examples on component mount
  useEffect(() => {
    const loadExamplesData = async () => {
      try {
        console.log("🔄 Loading examples from API...")
        const response = await fetch('/api/examples')

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()
        console.log("📊 Received examples from API:", data.examples)
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
    console.log("📋 Example selected:", exampleId)

    const example = examples.find(ex => ex.id === exampleId)
    if (example) {
      console.log("✅ Found example:", example)
      console.log("📝 Setting domain language:", example.domainLanguage)
      console.log("🎨 Setting visual language:", example.visualLanguage)

      setSelectedExample(exampleId)
      setDomainLanguage(example.domainLanguage)
      setVisualLanguage(example.visualLanguage)
      setHasGeneratedGraph(false) // Reset graph state when loading new example

      console.log("✅ Example loaded successfully. Click 'Generate Graph' to create visualization.")
    } else {
      console.warn("⚠️ Example not found:", exampleId)
    }
  }

  const handleCommentToggle = (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string, setValue: (value: string) => void) => {
    console.log('🔍 Key pressed:', e.key, 'Ctrl:', e.ctrlKey, 'Meta:', e.metaKey)

    // Check for Ctrl+/ (Windows/Linux) or Cmd+/ (Mac)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      console.log('✅ Comment shortcut triggered!')
      e.preventDefault()

      const textarea = e.currentTarget
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const lines = value.split('\n')

      console.log('📝 Selection:', { start, end, lines: lines.length })

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

      console.log('📊 Lines to comment:', { lineStart, lineEnd })

      // Toggle comments for selected lines
      const newLines = lines.map((line, index) => {
        if (index >= lineStart && index <= lineEnd) {
          const trimmedLine = line.trim()
          if (trimmedLine.startsWith('#')) {
            // Uncomment: remove # and any following space
            console.log('🔄 Uncommenting line:', line)
            return line.replace(/^\s*#\s?/, '')
          } else if (trimmedLine.length > 0) {
            // Comment: add # and space
            console.log('🔄 Commenting line:', line)
            return line.replace(/^(\s*)/, '$1# ')
          }
        }
        return line
      })

      const newValue = newLines.join('\n')
      console.log('📝 New value:', newValue)
      setValue(newValue)

      // Restore cursor position
      setTimeout(() => {
        textarea.focus()
        textarea.setSelectionRange(start, end)
      }, 0)
    }
  }

  const generateGraphviz = async (domain: string, visual: string) => {
    console.log("📝 Input Domain Language:", domain)
    console.log("🎨 Input Visual Language:", visual)

    // Check if domain language is empty
    if (!domain.trim()) {
      console.log("⚠️ Domain language is empty")
      throw new Error("Domain language is empty. Please enter some Logica code in the Domain Language field.")
    }

    try {
      // Call the API route to execute Logica
      const response = await fetch('/api/logica', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          domainLanguage: domain,
          visualLanguage: visual,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to execute Logica')
      }

      const { graphvizDot, logicaResults } = await response.json()
      console.log("🎨 Received Graphviz DOT:", graphvizDot)
      console.log("📊 Received Logica Results:", logicaResults)

      console.log("✅ Graph generation completed successfully!")
      console.log("🔄 Setting graphvizOutput state with:", graphvizDot.substring(0, 100) + "...")
      setGraphvizOutput(graphvizDot)
      setLogicaResults(logicaResults)
      setHasGeneratedGraph(true)
      console.log("✅ graphvizOutput state updated")
    } catch (error: any) {
      console.error("❌ Error running Logica:", error)
      // Throw the error so it can be caught by handleRunQuery
      throw new Error(`Logica execution failed: ${error.message}`)
    }
  }

  const handleRunQuery = async () => {
    console.log("🚀 Generate Graph button clicked!")
    console.log("📝 Current Domain Language:", domainLanguage)
    console.log("🎨 Current Visual Language:", visualLanguage)

    setIsGenerating(true)

    try {
      // Add a small delay to show the loading state
      await new Promise(resolve => setTimeout(resolve, 500))

      console.log("⚙️ Calling generateGraphviz function...")
      await generateGraphviz(domainLanguage, visualLanguage)

      toast({
        title: "Graph Generated!",
        description: "Your logic graph has been successfully generated.",
      })

      console.log("🎉 Graph generation completed and toast shown!")
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
      console.log("🏁 Generation process finished, loading state cleared")
    }
  }

  const handleGitHub = () => {
    window.open('https://github.com/yilinxia/DecViz', '_blank', 'noopener,noreferrer')
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Enhanced Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200/60 bg-white/80 backdrop-blur-xl shadow-sm">
        <div className="mx-auto w-[80%] px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg">
                    <Image
                      src="/logo.png"
                      alt="DecViz Logo"
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
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
                onClick={handleRunQuery}
                disabled={isGenerating}
                className="gap-2 h-12 px-6 rounded-xl text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <PlayIcon />
                    Generate Graph
                  </>
                )}
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
      <div className="mx-auto w-[80%] px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-140px)]">
          {/* Left Panel - Code Editors */}
          <div className="lg:col-span-5 flex flex-col space-y-6 h-full">
            {/* Domain Language Section */}
            <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#66B2EE' }}></div>
                      <Label className="text-sm font-semibold text-slate-800">Domain Language</Label>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{commentShortcut} to comment</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">Define your domain facts and relationships</p>
                  </div>

                  {/* Example Selector */}
                  <div className="ml-4">
                    <Select value={selectedExample} onValueChange={handleExampleChange}>
                      <SelectTrigger className="w-48 h-10 rounded-lg border-slate-200 bg-white transition-all duration-200 shadow-sm hover:bg-blue-100 hover:border-blue-300">
                        <SelectValue placeholder="Choose example">
                          {selectedExample ? examples.find(ex => ex.id === selectedExample)?.name : "Choose example"}
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
              <div className="flex-1 p-6 overflow-hidden">
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner overflow-hidden">
                  <Textarea
                    value={domainLanguage}
                    onChange={(e) => setDomainLanguage(e.target.value)}
                    onKeyDown={(e) => handleCommentToggle(e, domainLanguage, setDomainLanguage)}
                    placeholder={`# Define your domain facts here
Argument("a");
Argument("b");
Attacks("a", "b");
# This is a comment`}
                    className="w-full h-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 placeholder:text-slate-400 leading-relaxed rounded-xl p-4"
                    style={{
                      minHeight: '200px',
                      maxHeight: '100%',
                      colorScheme: 'dark'
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>

            {/* Visual Language Section */}
            <div className="flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
              <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-purple-50 border-b border-slate-200 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6BB56B' }}></div>
                  <Label className="text-sm font-semibold text-slate-800">Visual Language</Label>
                  <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">{commentShortcut} to comment</span>
                </div>
                <p className="text-xs text-slate-600 mt-1">Configure visualization settings</p>
              </div>
              <div className="flex-1 p-6 overflow-hidden">
                <div className="h-full rounded-xl border border-slate-200 bg-slate-50/50 shadow-inner overflow-hidden">
                  <Textarea
                    value={visualLanguage}
                    onChange={(e) => setVisualLanguage(e.target.value)}
                    onKeyDown={(e) => handleCommentToggle(e, visualLanguage, setVisualLanguage)}
                    placeholder={`Node( node_id: x, label: x, shape: "circle", border: "solid", fontsize: "14") :- Argument(x);
Edge(source_id: source, target_id: target, color: "black", style: "solid", arrowhead: "normal", arrowtail: "") :- Attacks(source, target);
# Configuration comments`}
                    className="w-full h-full resize-none font-mono text-sm border-0 bg-transparent focus-visible:ring-0 placeholder:text-slate-400 leading-relaxed rounded-xl p-4"
                    style={{
                      minHeight: '200px',
                      maxHeight: '100%',
                      colorScheme: 'dark'
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Panel - Graph Visualization */}
          <div className="lg:col-span-7 h-full bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-200 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isGenerating ? 'animate-pulse' : ''}`} style={{ backgroundColor: isGenerating ? '#EDD266' : '#EDD266' }}></div>
                  <Label className="text-sm font-semibold text-slate-800">Graph Visualization</Label>
                  {isGenerating && (
                    <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full font-medium">
                      Generating...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
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
                                onClick={() => {
                                  navigator.clipboard.writeText(graphvizOutput)
                                  toast({
                                    title: "Copied!",
                                    description: "DOT file content copied to clipboard.",
                                  })
                                }}
                                variant="outline"
                                size="sm"
                                className="gap-2 h-7 px-3 hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                Copy
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
                </div>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {isGenerating ? 'Generating graph...' : 'Interactive graph with zoom and pan controls'}
              </p>
            </div>
            <div className="flex-1 p-6 overflow-hidden">
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

      <Footer />
    </div>
  )
}
