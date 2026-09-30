import { supabase } from './supabase'

const MAX_EDGE = 1800

/**
 * Downscale in the browser before upload: phone photos are 4–12 MB, and
 * nobody needs more than ~1800px on a school site. Re-encodes to WebP
 * (JPEG where WebP encode isn't supported), which also strips EXIF —
 * including GPS — from photos of students.
 */
async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const webp = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', 0.85))
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  return jpeg ?? file
}

export async function uploadImage(file: File, folder = 'uploads') {
  if (file.size > 25 * 1024 * 1024) throw new Error('That file is over 25 MB.')
  const blob = await shrink(file)
  const ext = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() ?? 'bin')
  const path = `${folder}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, blob, {
    contentType: blob.type || file.type,
    cacheControl: '31536000',
  })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
