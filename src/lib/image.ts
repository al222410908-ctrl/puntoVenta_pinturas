export async function compressImageFile(file: File, maxDim = 1024, quality = 0.72, maxBytes = 350_000): Promise<string> {
  const source = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height))
    const w = Math.max(1, Math.round(source.width * scale))
    const h = Math.max(1, Math.round(source.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas no disponible')
    ctx.drawImage(source, 0, 0, w, h)
    canvas.toBlob?.(() => {})
    const dataUrl = canvas.toDataURL('image/jpeg', quality)
    const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)
    if (bytes > maxBytes && quality > 0.4) {
      return compressImageFile(file, maxDim, quality - 0.12, maxBytes)
    }
    return dataUrl
  } finally {
    source.close()
  }
}