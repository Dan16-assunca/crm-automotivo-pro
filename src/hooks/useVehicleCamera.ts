import { Capacitor } from '@capacitor/core'
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera'

/** Converts a base64 data URL to a Blob for Supabase Storage upload. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/jpeg'
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export interface VehiclePhoto {
  dataUrl: string
  blob: Blob
  filename: string
}

async function getPhotoFromCapacitor(source: CameraSource): Promise<VehiclePhoto | null> {
  try {
    const photo = await Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source,
      saveToGallery: false,
    })
    if (!photo.dataUrl) return null
    const blob = dataUrlToBlob(photo.dataUrl)
    const ext  = photo.format ?? 'jpeg'
    return { dataUrl: photo.dataUrl, blob, filename: `vehicle_${Date.now()}.${ext}` }
  } catch {
    // User cancelled or permission denied
    return null
  }
}

/**
 * Hook that abstracts camera access across native (Capacitor) and web (file input).
 *
 * On native: uses the Capacitor Camera plugin for direct camera access.
 * On web:    falls back to a hidden <input type="file"> with capture="environment".
 */
export function useVehicleCamera() {
  const isNative = Capacitor.isNativePlatform()

  /** Opens the device camera and returns the captured photo. Native-only. */
  async function takePhoto(): Promise<VehiclePhoto | null> {
    if (!isNative) return null
    return getPhotoFromCapacitor(CameraSource.Camera)
  }

  /** Opens the photo gallery / file picker. Works on native and web. */
  async function pickFromGallery(): Promise<VehiclePhoto | null> {
    if (isNative) {
      return getPhotoFromCapacitor(CameraSource.Photos)
    }
    // Web fallback: programmatically trigger a file input (sem capture= para abrir galeria)
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/jpeg,image/png,image/webp'
      // NÃO definir input.capture aqui — isso abriria a câmera em vez da galeria
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        const reader = new FileReader()
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string
          resolve({ dataUrl, blob: file, filename: file.name })
        }
        reader.readAsDataURL(file)
      }
      input.click()
    })
  }

  return { takePhoto, pickFromGallery, isNative }
}
