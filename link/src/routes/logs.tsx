import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, useRef } from 'react'
import { getLogs, type LogEntry } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { LuRefreshCw } from 'react-icons/lu'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})

function LogsPage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  function refresh() {
    setLoading(true)
    getLogs(500)
      .then((logs) => { setEntries(logs); setError(null) })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(refresh, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Logs</h2>

      <Card>
        <CardHeader>
          <CardTitle>Server Logs</CardTitle>
          <CardAction>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={setAutoRefresh}
                />
                Auto-refresh
              </div>
              <Button variant="ghost" size="icon-xs" onClick={refresh} disabled={loading}>
                <LuRefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-destructive text-sm mb-2">{error}</p>
          )}

          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No log entries yet.</p>
          ) : (
            <ScrollArea className="h-[60vh] rounded-md border bg-muted/30 p-1">
              <div className="font-mono text-xs space-y-px">
                {entries.map((entry, i) => (
                  <LogLine key={i} entry={entry} />
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>
          )}

          <p className="text-xs text-muted-foreground mt-2">
            Showing {entries.length} entries (max 500, 2s poll)
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function LogLine({ entry }: { entry: LogEntry }) {
  const levelColor: Record<string, string> = {
    ERROR: 'destructive',
    WARN: 'secondary',
    INFO: 'default',
    DEBUG: 'outline',
    TRACE: 'outline',
  }

  const variant = levelColor[entry.level] ?? 'outline'
  const timestamp = formatTimestamp(entry.timestamp_ms)

  return (
    <div className="flex items-start gap-2 px-2 py-0.5 hover:bg-accent/30 rounded">
      <span className="shrink-0 text-muted-foreground w-16">{timestamp}</span>
      <Badge variant={variant as 'default'} className="shrink-0 text-[10px] w-12 justify-center">
        {entry.level}
      </Badge>
      <span className="shrink-0 text-muted-foreground max-w-32 truncate">{entry.target}</span>
      <span className="text-foreground break-all">{entry.message}</span>
    </div>
  )
}

function formatTimestamp(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
