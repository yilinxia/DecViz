"use client"

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react"

interface LogicaEditorProps {
    value: string
    onChange: (value: string) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    placeholder?: string
    className?: string
    style?: React.CSSProperties
    spellCheck?: boolean
}

const LogicaEditor: React.FC<LogicaEditorProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    className = "",
    style,
    spellCheck = false
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const highlightRef = useRef<HTMLDivElement>(null)
    const gutterRef = useRef<HTMLDivElement>(null)
    const gutterInnerRef = useRef<HTMLPreElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isFocused, setIsFocused] = useState(false)

    // Memoized single-pass highlighter that avoids re-parsing its own HTML
    const highlightCode = useCallback((code: string): string => {
        if (!code) return ""

        const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')

        const tokenRegex = /(#[^\n]*$)|((?:\"(?:[^\"\\]|\\.)*\")|(?:'(?:[^'\\]|\\.)*'))|\b([A-Z][\w]*)\s*(?=\()|\b([a-z][\w]*)\b(?=\s*: )\s*:|\b(true|false|if|then|else|and|or|not)\b|(:\-|->|<=|>=|==|!=|&lt;|&gt;|<|>|=|\||&(?![a-zA-Z]+;))|\b(\d+\.?\d*)\b|\b([a-z][\w]*)\b/gm

        return escaped.replace(tokenRegex, (
            _match,
            comment,
            string,
            predicate,
            label,
            keyword,
            operator,
            number,
            variable
        ) => {
            if (comment) return `<span style=\"color: #6b7280;\">${comment}</span>`
            if (string) return `<span style=\"color: #111111;\">${string}</span>`
            if (predicate) return `<span style=\"color: #2563eb;\">${predicate}</span>`
            if (label) return `<span style=\"color: #16a34a;\">${label}</span>:`
            if (keyword) return `<span style=\"color: #111111;\">${keyword}</span>`
            if (operator) return `<span style=\"color: #6b7280;\">${operator}</span>`
            if (number) return `<span style=\"color: #111111;\">${number}</span>`
            if (variable) return `<span style=\"color: #dc2626;\">${variable}</span>`
            return _match
        })
    }, [])

    // Memoize the highlighted HTML to prevent unnecessary recalculations
    const highlightedHtml = useMemo(() => {
        return highlightCode(value)
    }, [value, highlightCode])

    // Sync scroll positions
    const handleScroll = useCallback(() => {
        if (textareaRef.current && highlightRef.current) {
            const top = textareaRef.current.scrollTop
            const left = textareaRef.current.scrollLeft
            highlightRef.current.scrollTop = top
            highlightRef.current.scrollLeft = left
            if (gutterInnerRef.current) {
                gutterInnerRef.current.style.transform = `translateY(-${top}px)`
            }
        }
    }, [])

    // Handle input changes
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value)
    }, [onChange])

    // Handle focus/blur events
    const handleFocus = useCallback(() => {
        setIsFocused(true)
    }, [])

    const handleBlur = useCallback(() => {
        setIsFocused(false)
    }, [])

    const lineCount = useMemo(() => (value ? value.split(/\n/).length : 1), [value])
    const gutterCh = Math.max(String(lineCount).length, 2) + 2

    return (
        <div
            ref={containerRef}
            className={`relative ${className}`}
            style={{
                fontFamily: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
                fontSize: '14px',
                lineHeight: '1.4',
                ...style
            }}
        >
            {/* Line number gutter */}
            <div
                ref={gutterRef}
                className="absolute inset-y-0 left-0 overflow-hidden border-r border-slate-200 select-none text-slate-400"
                style={{ width: `${gutterCh}ch`, background: 'rgba(0,0,0,0.03)' }}
            >
                <pre ref={gutterInnerRef} style={{ margin: 0, padding: '8px 4px', whiteSpace: 'pre', lineHeight: '1.4', willChange: 'transform' }}>
                    {Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n')}
                </pre>
            </div>
            {/* Syntax highlighting overlay (only when there is content) */}
            {value && (
                <div
                    ref={highlightRef}
                    className="absolute inset-0 pointer-events-none whitespace-pre-wrap overflow-hidden p-2 m-0 border-0 bg-transparent z-10"
                    style={{
                        font: 'inherit',
                        wordWrap: 'break-word',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        color: 'rgba(0,0,0,0.9)',
                        paddingLeft: `calc(${gutterCh}ch + 8px)`
                    }}
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: `${highlightedHtml}<span style=\"visibility:hidden\">.</span>` }}
                />
            )}

            {/* Input textarea */}
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={onKeyDown}
                onScroll={handleScroll}
                onFocus={handleFocus}
                onBlur={handleBlur}
                placeholder={placeholder}
                spellCheck={spellCheck}
                className={`relative bg-transparent ${value ? 'text-transparent' : 'text-slate-500'} resize-none outline-none border-none p-2 m-0 w-full h-full whitespace-pre-wrap overflow-y-auto overflow-x-hidden z-20`}
                style={{
                    caretColor: isFocused ? '#2563eb' : '#374151',
                    font: 'inherit',
                    wordWrap: 'break-word',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                    paddingLeft: `calc(${gutterCh}ch + 8px)`
                }}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
            />
        </div>
    )
}

export default LogicaEditor
