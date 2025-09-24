"use client"

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react"
import dynamic from "next/dynamic"
// Monaco-based editor (client-only)
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false })

interface LogicaEditorProps {
    value: string
    onChange: (value: string) => void
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
    placeholder?: string
    className?: string
    style?: React.CSSProperties
    spellCheck?: boolean
    useOverlayHighlighting?: boolean
}

const LogicaEditor: React.FC<LogicaEditorProps> = ({
    value,
    onChange,
    onKeyDown,
    placeholder,
    className = "",
    style,
    spellCheck = false,
    useOverlayHighlighting = false
}) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const highlightRef = useRef<HTMLDivElement>(null)
    const gutterRef = useRef<HTMLDivElement>(null)
    const gutterInnerRef = useRef<HTMLPreElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [isFocused, setIsFocused] = useState(false)
    const [isClient, setIsClient] = useState(false)

    useEffect(() => {
        setIsClient(true)
    }, [])

    // Memoized single-pass highlighter that avoids re-parsing its own HTML
    const highlightCode = useCallback((code: string): string => {
        if (!code) return ""

        const escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')

        const tokenRegex = /((?:#[^\n]*$)|(?:%[^\n]*$))|((?:\"(?:[^\"\\]|\\.)*\")|(?:'(?:[^'\\]|\\.)*'))|\b([A-Z][\w]*)\s*(?=\()|\b([a-z][\w]*)\b(?=\s*: )\s*:|\b(true|false|if|then|else|and|or|not)\b|(:\-|->|<=|>=|==|!=|&lt;|&gt;|<|>|=|\||&(?![a-zA-Z]+;))|\b(\d+\.?\d*)\b|\b([a-z][\w]*)\b/gm

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

    const showOverlay = !!value && !!useOverlayHighlighting

    // Prefer Monaco by default when overlay highlighting is not requested
    const prefersMonaco = !useOverlayHighlighting

    // Monaco path: render stable container on server to avoid hydration mismatch
    if (prefersMonaco) {
        return (
            <div className={`relative ${className}`} style={{ ...style, overflow: 'hidden' }} suppressHydrationWarning>
                {isClient && (
                    <MonacoEditor
                        height="100%"
                        defaultLanguage="prolog"
                        language="prolog"
                        value={value}
                        onChange={(v) => onChange(v || '')}
                        onMount={(editor, monaco) => {
                            // Basic Logica/Prolog-like tokenizer if not present
                            try {
                                monaco.languages.register({ id: 'prolog' })
                                monaco.languages.setMonarchTokensProvider('prolog', {
                                    tokenizer: {
                                        root: [
                                            // Enter clingo block on triple quote
                                            [/"""/, { token: 'string.delim', next: 'clingo' }],
                                            // Hash comments in normal script
                                            [/#[^\n]*/, 'comment'],
                                            // Strings and tokens
                                            [/"([^"\\]|\\.)*"|'([^'\\]|\\.)*'/, 'string'],
                                            [/\b(true|false|if|then|else|and|or|not)\b/, 'keyword'],
                                            [/\b([A-Z][\w]*)\b(?=\s*\()/, 'type.identifier'],
                                            [/\b([a-z][\w]*)\b(?=\s*:\s*)/, 'key'],
                                            [/(:\-|->|<=|>=|==|!=|<|>|=|\||&)/, 'operator'],
                                            [/\b\d+\b/, 'number'],
                                            [/\b[a-z][\w]*\b/, 'identifier']
                                        ],
                                        clingo: [
                                            // Exit clingo block
                                            [/"""/, { token: 'string.delim', next: '@pop' }],
                                            // Percent comments inside clingo block
                                            [/%[^\n]*/, 'comment'],
                                            // Everything else is treated as string content for now
                                            [/[^\n]+/, 'string']
                                        ]
                                    }
                                })
                                // Provide language configuration so Monaco knows the line comment token
                                monaco.languages.setLanguageConfiguration('prolog', {
                                    // Default line comment for normal script
                                    comments: { lineComment: '#' },
                                    brackets: [
                                        ['{', '}'],
                                        ['[', ']'],
                                        ['(', ')']
                                    ],
                                    autoClosingPairs: [
                                        { open: '"', close: '"' },
                                        { open: "'", close: "'" },
                                        { open: '(', close: ')' },
                                        { open: '[', close: ']' },
                                        { open: '{', close: '}' }
                                    ],
                                })
                            } catch { }
                            // Theme that blends with app & removes left gutter margins
                            try {
                                monaco.editor.defineTheme('decvizTheme', {
                                    base: 'vs',
                                    inherit: true,
                                    rules: [
                                        { token: 'comment', foreground: '6b7280' },
                                        { token: 'string', foreground: '111111' },
                                        { token: 'type.identifier', foreground: '2563eb' },
                                        { token: 'key', foreground: '16a34a' },
                                        { token: 'keyword', foreground: '111111', fontStyle: 'bold' },
                                        { token: 'operator', foreground: '6b7280' },
                                        { token: 'number', foreground: '111111' },
                                        { token: 'identifier', foreground: 'dc2626' }
                                    ],
                                    colors: {
                                        'editor.background': '#ffffff00',
                                        'editorLineNumber.foreground': '#94a3b8',
                                        'editorLineNumber.activeForeground': '#94a3b8',
                                        'editor.lineHighlightBackground': '#00000000',
                                        'editor.lineHighlightBorder': '#00000000',
                                        'editor.selectionBackground': '#80c7ff66',
                                        'editor.selectionHighlightBackground': '#00000000',
                                        'editor.selectionHighlightBorder': '#00000000',
                                        'editor.wordHighlightBackground': '#00000000',
                                        'editor.wordHighlightStrongBackground': '#00000000',
                                        'editor.findMatchHighlightBackground': '#00000000',
                                        'editorGutter.background': '#ffffff00',
                                        'editorGutter.border': '#e5e7eb',
                                        'editorOverviewRuler.border': '#00000000',
                                        'scrollbar.shadow': '#00000000',
                                        'editorWidget.border': '#00000026',
                                        'focusBorder': '#00000000'
                                    }
                                })
                                monaco.editor.setTheme('decvizTheme')
                                // Remove extra padding in the editor to show full rounded borders
                                editor.updateOptions({
                                    glyphMargin: false,
                                    folding: false,
                                    lineDecorationsWidth: 22,
                                    lineNumbersMinChars: 3,
                                })
                            } catch { }
                        }}
                        options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace',
                            fontSize: 14,
                            lineNumbers: 'on',
                            roundedSelection: true,
                            automaticLayout: true,
                            tabSize: 2,
                            renderWhitespace: 'none',
                            lineDecorationsWidth: 22,
                            lineNumbersMinChars: 3,
                            renderLineHighlight: 'none',
                            selectionHighlight: false,
                            occurrencesHighlight: false,
                            matchBrackets: 'never',
                            bracketPairColorization: { enabled: false },
                            stickyScroll: { enabled: false },
                            padding: { top: 8, bottom: 8 },
                        }}
                    />
                )}
            </div>
        )
    }

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
            {/* Syntax highlighting overlay (optional) */}
            {showOverlay && (
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
                className={`relative bg-transparent ${showOverlay ? 'text-transparent selection:text-transparent' : 'text-slate-800'
                    } ${!value ? 'text-slate-500' : ''} selection:bg-blue-400/50 resize-none outline-none border-none p-2 m-0 w-full h-full whitespace-pre-wrap overflow-y-auto overflow-x-hidden z-20`}
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
