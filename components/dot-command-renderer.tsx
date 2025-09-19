"use client"

import React, { useEffect, useRef, useState, memo, useCallback } from "react"
import { Button } from "./ui/button"
import { Maximize2, Download, ZoomIn, ZoomOut } from "lucide-react"

interface DotCommandRendererProps {
    dot: string
    className?: string
}

const DotCommandRenderer = memo(({ dot, className = "" }: DotCommandRendererProps) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const svgRef = useRef<SVGElement | null>(null)
    const panZoomRef = useRef<any>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [svgContent, setSvgContent] = useState<string>("")

    // Simple rendering function using dot command API
    useEffect(() => {
        const renderGraph = async () => {
            if (!dot.trim()) {
                // console.log("🎨 DotCommandRenderer: No DOT to render")
                return
            }

            // console.log("🎨 DotCommandRenderer: Rendering DOT:", dot.substring(0, 100) + "...")
            setIsLoading(true)
            setError(null)

            try {
                // console.log("🔄 DotCommandRenderer: Starting rendering process...")
                // console.log("📝 DotCommandRenderer: DOT input:", dot)

                // Call our dot command API
                const response = await fetch('/api/dot-to-svg', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ dot }),
                })

                if (!response.ok) {
                    const errorData = await response.json()
                    throw new Error(errorData.error || 'Failed to generate SVG')
                }

                const data = await response.json()
                const svg = data.svg

                // console.log("✅ DotCommandRenderer: SVG generated, length:", svg.length)
                // console.log("📄 DotCommandRenderer: SVG content:", svg.substring(0, 500) + "...")

                if (containerRef.current) {
                    // console.log("📦 DotCommandRenderer: Container found, setting innerHTML...")

                    // Create the same structure as edotor.net
                    const htmlContent = `
            <div class="graph-container successful">
              <div class="graph">
                ${svg}
              </div>
            </div>
          `

                    // console.log("🏗️ DotCommandRenderer: HTML content:", htmlContent.substring(0, 200) + "...")

                    containerRef.current.innerHTML = htmlContent
                    setSvgContent(svg)

                    const svgElement = containerRef.current.querySelector("svg")
                    // console.log("🎯 DotCommandRenderer: SVG element found:", svgElement ? "YES" : "NO")

                    if (svgElement) {
                        // console.log("📏 DotCommandRenderer: SVG dimensions:", svgElement.getAttribute("width"), "x", svgElement.getAttribute("height"))
                        svgRef.current = svgElement

                        // Apply the same styling as edotor.net
                        svgElement.style.overflow = "hidden"
                        svgElement.style.width = "100%"
                        svgElement.style.height = "auto"
                        svgElement.style.maxWidth = "none"
                        svgElement.style.display = "block"
                        svgElement.style.cursor = "grab"

                        // console.log("🎨 DotCommandRenderer: SVG styles applied")

                        // Initialize pan and zoom
                        try {
                            // Destroy existing pan-zoom instance if it exists
                            if (panZoomRef.current) {
                                panZoomRef.current.destroy()
                            }

                            // Dynamically import svg-pan-zoom only on client side
                            const { default: svgPanZoom } = await import("svg-pan-zoom")

                            // Initialize new pan-zoom instance
                            panZoomRef.current = svgPanZoom(svgElement, {
                                zoomEnabled: true,
                                controlIconsEnabled: false,
                                fit: true,
                                center: true,
                                minZoom: 0.1,
                                maxZoom: 10,
                                zoomScaleSensitivity: 0.2,
                                panEnabled: true,
                                dblClickZoomEnabled: true,
                                mouseWheelZoomEnabled: true,
                                preventMouseEventsDefault: false,
                                onZoom: (level: number) => {
                                    // console.log("🔍 Zoom level:", level)
                                }
                            })

                            // console.log("🎯 DotCommandRenderer: Pan-zoom initialized")
                        } catch (err) {
                            console.error("❌ DotCommandRenderer: Error initializing pan-zoom:", err)
                        }

                        // Add hover effects to nodes
                        const nodes = svgElement.querySelectorAll("g.node")
                        // console.log(`🎯 DotCommandRenderer: Found ${nodes.length} nodes`)

                        nodes.forEach((node) => {
                            const title = node.querySelector("title")?.textContent
                            if (title) {
                                node.setAttribute("title", `Node: ${title}`)
                                node.addEventListener("mouseenter", (e) => {
                                    const target = e.currentTarget as Element
                                    target.setAttribute("opacity", "0.8")
                                })
                                node.addEventListener("mouseleave", (e) => {
                                    const target = e.currentTarget as Element
                                    target.setAttribute("opacity", "1")
                                })
                            }
                        })
                    } else {
                        // console.log("❌ DotCommandRenderer: No SVG element found in container!")
                    }

                    // console.log("✅ DotCommandRenderer: Graph rendered successfully!")
                } else {
                    // console.log("❌ DotCommandRenderer: Container ref is null!")
                }
            } catch (err) {
                console.error("❌ DotCommandRenderer: Rendering error:", err)
                setError(err instanceof Error ? err.message : "Failed to render graph")
            } finally {
                setIsLoading(false)
            }
        }

        renderGraph()
    }, [dot])

    // Cleanup pan-zoom instance on unmount
    useEffect(() => {
        return () => {
            if (panZoomRef.current) {
                try {
                    panZoomRef.current.destroy()
                    // console.log("🧹 DotCommandRenderer: Pan-zoom instance destroyed")
                } catch (err) {
                    console.error("❌ DotCommandRenderer: Error destroying pan-zoom:", err)
                }
            }
        }
    }, [])


    const handleFitToScreen = useCallback(() => {
        if (panZoomRef.current) {
            try {
                // Ensure pan-zoom recalculates viewport before fitting
                if (typeof panZoomRef.current.resize === 'function') {
                    panZoomRef.current.resize()
                }
                panZoomRef.current.fit()
                panZoomRef.current.center()
                // console.log("🎯 DotCommandRenderer: Fitted to screen using pan-zoom")
            } catch (err) {
                console.error("❌ DotCommandRenderer: Error fitting to screen:", err)
            }
        }
    }, [])

    const handleZoomIn = useCallback(() => {
        if (panZoomRef.current) {
            try {
                panZoomRef.current.zoomIn()
                // console.log("🔍 DotCommandRenderer: Zoomed in")
            } catch (err) {
                console.error("❌ DotCommandRenderer: Error zooming in:", err)
            }
        }
    }, [])

    const handleZoomOut = useCallback(() => {
        if (panZoomRef.current) {
            try {
                panZoomRef.current.zoomOut()
                // console.log("🔍 DotCommandRenderer: Zoomed out")
            } catch (err) {
                console.error("❌ DotCommandRenderer: Error zooming out:", err)
            }
        }
    }, [])

    const handleDownload = useCallback(() => {
        if (svgContent) {
            const blob = new Blob([svgContent], { type: 'image/svg+xml' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = 'graph.svg'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
        }
    }, [svgContent])


    const handleRefresh = useCallback(() => {
        setError(null)
        setIsLoading(true)
        // Force re-render by clearing the container and triggering useEffect
        if (containerRef.current) {
            containerRef.current.innerHTML = ''
        }
        // The useEffect will automatically re-run due to the dot dependency
    }, [])

    return (
        <div className={`relative w-full h-full ${className}`}>
            {/* Keep pan-zoom sizing synced with container changes (e.g., sidebar toggle, window resize) */}
            {(() => {
                // Inline effect to attach observers without extra re-renders
                // This pattern keeps indentation/locality without adding new hooks above
                // eslint-disable-next-line react-hooks/rules-of-hooks
                useEffect(() => {
                    let resizeObserver: ResizeObserver | null = null
                    const handleContainerResize = () => {
                        if (panZoomRef.current && typeof panZoomRef.current.resize === 'function') {
                            try {
                                panZoomRef.current.resize()
                            } catch (err) {
                                // noop
                            }
                        }
                    }
                    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
                        resizeObserver = new ResizeObserver(() => {
                            // Defer to next frame so CSS transitions can settle
                            requestAnimationFrame(handleContainerResize)
                        })
                        resizeObserver.observe(containerRef.current)
                    }
                    const onWindowResize = () => {
                        requestAnimationFrame(handleContainerResize)
                    }
                    window.addEventListener('resize', onWindowResize)
                    return () => {
                        window.removeEventListener('resize', onWindowResize)
                        if (resizeObserver && containerRef.current) {
                            try { resizeObserver.unobserve(containerRef.current) } catch { }
                            try { resizeObserver.disconnect() } catch { }
                        }
                    }
                }, [])
                return null
            })()}
            {/* Controls */}
            <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-2 items-end">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleZoomIn}
                    disabled={!panZoomRef.current}
                    className="bg-white/80 backdrop-blur-sm"
                >
                    <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleZoomOut}
                    disabled={!panZoomRef.current}
                    className="bg-white/80 backdrop-blur-sm"
                >
                    <ZoomOut className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleFitToScreen}
                    disabled={!panZoomRef.current}
                    className="bg-white/80 backdrop-blur-sm"
                >
                    <Maximize2 className="h-4 w-4" />
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!svgContent}
                    className="bg-white/80 backdrop-blur-sm"
                >
                    <Download className="h-4 w-4" />
                </Button>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm z-20">
                    <div className="flex items-center gap-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="text-sm font-medium text-gray-700">Generating graph...</span>
                    </div>
                </div>
            )}

            {/* Error state */}
            {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-50 border-2 border-red-200 rounded-lg">
                    <div className="text-center p-4">
                        <div className="text-red-600 font-medium mb-2">Rendering Error</div>
                        <div className="text-sm text-red-500 mb-4">{error}</div>
                        <Button onClick={handleRefresh} variant="outline" size="sm">
                            Try Again
                        </Button>
                    </div>
                </div>
            )}

            {/* Graph container */}
            <div
                ref={containerRef}
                className="w-full h-full bg-white border border-gray-200 rounded-lg overflow-hidden"
            />
        </div>
    )
})

DotCommandRenderer.displayName = "DotCommandRenderer"

export default DotCommandRenderer
