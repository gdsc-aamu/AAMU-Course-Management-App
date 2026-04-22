"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Plus, Trash2, Edit2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { authenticatedFetch } from "@/lib/api-client"
import type { ChatThread } from "@/lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"

interface ChatHistorySidebarProps {
  planId: string
  selectedThreadId: string
  onSelectThread: (id: string) => void
  onCreateThread: () => void
  newThread?: ChatThread | null
}

export function ChatHistorySidebar({
  planId,
  selectedThreadId,
  onSelectThread,
  onCreateThread,
  newThread,
}: ChatHistorySidebarProps) {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deleteThreadId, setDeleteThreadId] = useState<string | null>(null)
  const [renameThreadId, setRenameThreadId] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState("")
  const { toast } = useToast()

  // Load threads on mount or when planId changes
  useEffect(() => {
    loadThreads()
  }, [planId])

  // Prepend newly created thread from parent without refetching
  useEffect(() => {
    if (!newThread) return
    setThreads((prev) => {
      if (prev.some((t) => t.id === newThread.id)) return prev
      return [newThread, ...prev]
    })
  }, [newThread])

  const loadThreads = async () => {
    try {
      setIsLoading(true)
      const response = await authenticatedFetch(`/api/chat/threads?planId=${encodeURIComponent(planId)}`)

      if (!response.ok) {
        throw new Error(`Failed to load threads: ${response.statusText}`)
      }

      const data = await response.json()
      setThreads(data.threads || [])
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to load threads"
      console.error("[ChatHistorySidebar] Load error:", errorMsg)
      toast({
        title: "Failed to load chat history",
        description: errorMsg,
        variant: "destructive",
      })
      setThreads([])
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteThreadId) return

    try {
      const response = await authenticatedFetch(`/api/chat/threads/${deleteThreadId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete thread")
      }

      setThreads((prev) => prev.filter((t) => t.id !== deleteThreadId))
      setDeleteThreadId(null)

      // If deleted thread was selected, select first available or create new
      if (selectedThreadId === deleteThreadId) {
        if (threads.length > 1) {
          const nextThread = threads.find((t) => t.id !== deleteThreadId)
          if (nextThread) {
            onSelectThread(nextThread.id)
          }
        } else {
          onCreateThread()
        }
      }

      toast({
        title: "Chat deleted",
        description: "The conversation has been removed.",
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to delete thread"
      toast({
        title: "Failed to delete chat",
        description: errorMsg,
        variant: "destructive",
      })
    }
  }

  const handleStartRename = (thread: ChatThread) => {
    setRenameThreadId(thread.id)
    setNewTitle(thread.title)
  }

  const handleRename = async () => {
    if (!renameThreadId || !newTitle.trim()) return

    try {
      const response = await authenticatedFetch(`/api/chat/threads/${renameThreadId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      })

      if (!response.ok) {
        throw new Error("Failed to rename thread")
      }

      setThreads((prev) =>
        prev.map((t) => (t.id === renameThreadId ? { ...t, title: newTitle.trim() } : t))
      )
      setRenameThreadId(null)
      setNewTitle("")

      toast({
        title: "Chat renamed",
        description: "The conversation title has been updated.",
      })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Failed to rename thread"
      toast({
        title: "Failed to rename chat",
        description: errorMsg,
        variant: "destructive",
      })
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else if (date.getFullYear() === today.getFullYear()) {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
    }
  }

  return (
    <div className="flex h-full flex-col border-r bg-muted/50">
      <div className="border-b p-4">
        <Button onClick={onCreateThread} className="w-full gap-2" size="sm">
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : threads.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            No conversations yet. Create one to get started!
          </div>
        ) : (
          <div className="space-y-2 p-3">
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  "group rounded-lg p-3 text-sm cursor-pointer transition-colors hover:bg-muted",
                  selectedThreadId === thread.id ? "bg-primary/10 text-primary" : "text-foreground"
                )}
                onClick={() => onSelectThread(thread.id)}
              >
                <div className="flex justify-between items-start gap-2 min-w-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{thread.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(thread.created_at)}</p>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(thread)
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteThreadId(thread.id)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteThreadId} onOpenChange={(open) => !open && setDeleteThreadId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete the conversation. This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={!!renameThreadId} onOpenChange={(open) => !open && setRenameThreadId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
            <DialogDescription>Enter a new name for this conversation.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Chat name..."
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRename()
            }}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRenameThreadId(null)
                setNewTitle("")
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newTitle.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
