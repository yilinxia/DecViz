"use client"

import React, { useMemo, useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarSeparator } from "@/components/ui/sidebar"
import { HistoryEntry } from "@/types/history"
import { Pencil } from "lucide-react"

interface HistoryPanelProps {
    entries: HistoryEntry[]
    selectedIds: string[]
    onToggleSelect: (id: string) => void
    onClear: () => void
    onCompare: () => void
    onEditAnnotation: (id: string, value: string) => void
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ entries, selectedIds, onToggleSelect, onClear, onCompare, onEditAnnotation }) => {
    const canCompare = selectedIds.length === 2

    const sorted = useMemo(() => {
        return [...entries].sort((a, b) => b.timestamp - a.timestamp)
    }, [entries])

    const [editingId, setEditingId] = useState<string | null>(null)
    const [draft, setDraft] = useState<string>("")

    const startEdit = useCallback((entry: HistoryEntry) => {
        setEditingId(entry.id)
        setDraft(entry.annotation || "")
    }, [])

    const commitEdit = useCallback((entry: HistoryEntry) => {
        onEditAnnotation(entry.id, draft.trim())
        setEditingId(null)
    }, [draft, onEditAnnotation])

    return (
        <div className="h-full flex flex-col">
            <SidebarHeader>
                <div className="flex items-center justify-between px-1 py-1">
                    <span className="text-sm font-semibold">History</span>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={!canCompare} onClick={onCompare} className="h-7 px-2">Compare</Button>
                        <Button size="sm" variant="outline" onClick={onClear} className="h-7 px-2">Clear</Button>
                    </div>
                </div>
            </SidebarHeader>
            <SidebarSeparator />
            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>Runs</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <ul className="space-y-2 pr-1">
                            {sorted.length === 0 && (
                                <li className="text-xs text-slate-500 px-2 py-1">No runs yet. Generate a graph to record.</li>
                            )}
                            {sorted.map((entry) => {
                                const isChecked = selectedIds.includes(entry.id)
                                const date = new Date(entry.timestamp)
                                return (
                                    <li key={entry.id} className="bg-white border border-slate-200 rounded-md p-2">
                                        <div className="flex items-start gap-2">
                                            <Checkbox checked={isChecked} onCheckedChange={() => onToggleSelect(entry.id)} />
                                            <div className="flex-1 min-w-0">
                                                {editingId === entry.id ? (
                                                    <Input
                                                        autoFocus
                                                        value={draft}
                                                        onChange={(e) => setDraft(e.target.value)}
                                                        onBlur={() => commitEdit(entry)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.preventDefault()
                                                                commitEdit(entry)
                                                            } else if (e.key === 'Escape') {
                                                                setEditingId(null)
                                                            }
                                                        }}
                                                        placeholder="Add a title..."
                                                        className="h-7 text-xs"
                                                    />
                                                ) : (
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            className="text-[12px] font-semibold text-slate-900 truncate"
                                                            title={entry.annotation?.trim() || "Add a title"}
                                                            onClick={() => startEdit(entry)}
                                                        >
                                                            {entry.annotation?.trim() || "Add a title"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="opacity-60 hover:opacity-100 transition-opacity"
                                                            aria-label="Edit title"
                                                            onClick={() => startEdit(entry)}
                                                        >
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="mt-1 flex items-center justify-between">
                                                    <span className="text-[11px] font-medium text-slate-700">{date.toLocaleString()}</span>
                                                    <span className="text-[10px] text-slate-500 truncate max-w-[160px]">{entry.domainLanguage.split("\n")[0] || "(domain)"}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-600">
                                            <div className="truncate" title={entry.domainLanguage}>Domain: {entry.domainLanguage.length} ch</div>
                                            <div className="truncate" title={entry.visualLanguage}>Visual: {entry.visualLanguage.length} ch</div>
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>
        </div>
    )
}

export default HistoryPanel


