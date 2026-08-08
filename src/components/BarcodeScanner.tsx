import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { ScanLine, AlertTriangle } from 'lucide-react'
import { Button, Input, Modal } from './ui'

const READER_ID = 'barcode-reader'

export function BarcodeScanner({
  open,
  onClose,
  onScan,
}: {
  open: boolean
  onClose: () => void
  onScan: (code: string) => void
}) {
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (!open) return
    let disposed = false
    let scanner: Html5Qrcode | null = null
    setScanning(true)
    setError(null)

    const start = async () => {
      try {
        scanner = new Html5Qrcode(READER_ID)
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded) => {
            if (!disposed) onScan(decoded)
          },
          () => {},
        )
        if (!disposed) setScanning(true)
      } catch (e) {
        if (!disposed) {
          setScanning(false)
          setError(
            e instanceof Error ? e.message : 'No se pudo abrir la cámara',
          )
        }
      }
    }
    void start()

    return () => {
      disposed = true
      if (scanner?.isScanning) {
        scanner
          .stop()
          .then(() => scanner?.clear())
          .catch(() => {})
      }
    }
  }, [open, onScan])

  return (
    <Modal open={open} onClose={onClose} title="Escanear código">
      <div className="space-y-4">
        <div id={READER_ID} className="w-full overflow-hidden rounded-xl bg-black" />
        {scanning && <p className="flex items-center gap-2 text-sm text-slate-500"><ScanLine className="h-4 w-4" /> Apunta al código de barras del producto…</p>}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) {
              onScan(manual.trim())
              setManual('')
            }
          }}
        >
          <Input
            placeholder="Escribir código a mano"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <Button type="submit" className="shrink-0">Buscar</Button>
        </form>
        {error && <Button className="w-full" onClick={() => { setError(null); onClose() }}>Cancelar</Button>}
      </div>
    </Modal>
  )
}
