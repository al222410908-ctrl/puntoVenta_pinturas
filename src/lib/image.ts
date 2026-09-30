/**
 * Comprime una imagen localmente a JPEG y la sube a Cloudinary (unsigned upload).
 * Devuelve la URL pública de Cloudinary.
 *
 * Si VITE_CLOUDINARY_CLOUD_NAME o VITE_CLOUDINARY_UPLOAD_PRESET no están definidos,
 * cae back a Base64 para no romper en entornos sin configuración.
 */
export async function uploadImage(file: File): Promise<string> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

  // Primero comprimimos para reducir el tamaño de subida
  const dataUrl = await compressImageFile(file)

  if (!cloudName || !uploadPreset) {
    // Sin configuración de Cloudinary → usar Base64 como antes
    return dataUrl
  }

  const formData = new FormData()
  formData.append('file', dataUrl)
  formData.append('upload_preset', uploadPreset)

  const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '')
    throw new Error(`Error al subir imagen a Cloudinary (${resp.status}): ${detail}`)
  }

  const result = (await resp.json()) as { secure_url: string }
  return result.secure_url
}

/**
 * Sube un Data URL (Base64) directamente a Cloudinary.
 * Devuelve la URL pública, o null si falla (conserva el original).
 */
export async function uploadDataUrl(
  dataUrl: string,
  cloudName: string,
  uploadPreset: string,
): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', dataUrl)
    formData.append('upload_preset', uploadPreset)

    const resp = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!resp.ok) return null
    const result = (await resp.json()) as { secure_url: string }
    return result.secure_url ?? null
  } catch {
    return null
  }
}

export interface MigrationProgress {
  current: number
  total: number
  name: string
}

export interface MigrationResult {
  migrated: number
  skipped: number
  errors: number
}

/**
 * Migra en lote todas las fotos Base64 de productos (y el logo del negocio)
 * a Cloudinary. Actualiza IndexedDB y localStorage con las nuevas URLs.
 *
 * - Solo procesa imágenes que empiezan con "data:image/" (Base64 antiguas).
 * - Si una subida falla, conserva el Base64 original (sin pérdida de datos).
 * - Marca los productos con updatedAt actualizado para que se sincronicen.
 */
export async function migratePhotosToCloudinary(
  onProgress?: (p: MigrationProgress) => void,
): Promise<MigrationResult> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

  if (!cloudName || !uploadPreset) {
    throw new Error('Cloudinary no está configurado')
  }

  // Importamos aquí para evitar ciclos de dependencia
  const { db } = await import('../db/db')
  const { loadBusinessInfo, saveBusinessInfo } = await import('./ticket')
  const { notifyLocalChange } = await import('./sync')

  const products = await db.products.toArray()
  const toMigrate = products.filter((p) => p.photo?.startsWith('data:image/'))

  // Verificar también el logo del negocio
  const biz = loadBusinessInfo()
  const logoNeedsMigration = biz.logo?.startsWith('data:image/')

  const total = toMigrate.length + (logoNeedsMigration ? 1 : 0)
  const result: MigrationResult = { migrated: 0, skipped: 0, errors: 0 }

  if (total === 0) return result

  let current = 0

  // ── Migrar fotos de productos ──────────────────────────────────────────────
  for (const product of toMigrate) {
    current++
    onProgress?.({ current, total, name: product.name })

    const url = await uploadDataUrl(product.photo!, cloudName, uploadPreset)

    if (url) {
      await db.products.update(product.id, { photo: url, updatedAt: Date.now() })
      result.migrated++
    } else {
      // Fallo: conservamos el Base64 original
      result.errors++
    }
  }

  // ── Migrar logo del negocio ────────────────────────────────────────────────
  if (logoNeedsMigration) {
    current++
    onProgress?.({ current, total, name: 'Logo del negocio' })

    const url = await uploadDataUrl(biz.logo!, cloudName, uploadPreset)
    if (url) {
      saveBusinessInfo({ ...biz, logo: url })
      result.migrated++
    } else {
      result.errors++
    }
  }

  if (result.migrated > 0) {
    notifyLocalChange()
  }

  return result
}

/**
 * Comprime un archivo de imagen a JPEG usando Canvas.
 * Devuelve un Data URL (Base64). Usado internamente por uploadImage.
 */
export async function compressImageFile(
  file: File,
  maxDim = 640,
  quality = 0.7,
  maxBytes = 160_000,
): Promise<string> {
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