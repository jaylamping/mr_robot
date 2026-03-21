import { useEffect, useRef } from 'react'
import { useTelemetryStore, type TelemetrySnapshot } from '../stores/telemetry'

interface CertHashResponse {
  hash_b64: string
  port: number
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export function useWebTransport() {
  const transportRef = useRef<WebTransport | null>(null)
  const activeRef = useRef(true)
  const updateSnapshot = useTelemetryStore((s) => s.updateSnapshot)
  const setConnected = useTelemetryStore((s) => s.setConnected)

  useEffect(() => {
    activeRef.current = true

    async function connect() {
      while (activeRef.current) {
        try {
          const res = await fetch('/api/cert-hash')
          if (!res.ok) throw new Error(`cert-hash fetch failed: ${res.status}`)
          const { hash_b64, port } = (await res.json()) as CertHashResponse

          const host = window.location.hostname || 'localhost'
          const url = `https://${host}:${port}`

          const transport = new WebTransport(url, {
            serverCertificateHashes: [
              {
                algorithm: 'sha-256',
                value: base64ToArrayBuffer(hash_b64),
              },
            ],
          })

          await transport.ready
          transportRef.current = transport
          setConnected(true)

          const reader = transport.datagrams.readable.getReader()
          const decoder = new TextDecoder()

          while (activeRef.current) {
            const { value, done } = await reader.read()
            if (done) break
            try {
              const json = decoder.decode(value)
              const snap = JSON.parse(json) as TelemetrySnapshot
              updateSnapshot(snap)
            } catch {
              // malformed datagram, skip
            }
          }

          reader.releaseLock()
          transport.close()
        } catch (err) {
          console.warn('[WebTransport] connection error, retrying in 2s:', err)
        }

        transportRef.current = null
        setConnected(false)

        if (activeRef.current) {
          await new Promise((r) => setTimeout(r, 2000))
        }
      }
    }

    connect()

    return () => {
      activeRef.current = false
      if (transportRef.current) {
        transportRef.current.close()
        transportRef.current = null
      }
      setConnected(false)
    }
  }, [updateSnapshot, setConnected])
}
