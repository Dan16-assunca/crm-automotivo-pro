#!/usr/bin/env node
/**
 * Gera ícones PWA em PNG para o CRM Automotivo Pro.
 *
 * Requer: npm install sharp -D   (apenas para gerar os ícones, não vai para o bundle)
 *
 * Uso: node scripts/generate-pwa-icons.js
 * Saída: public/icons/icon-192.png  e  public/icons/icon-512.png
 *
 * Se o sharp não estiver instalado, use a alternativa abaixo ou o Figma/Canva para exportar
 * os ícones a partir do arquivo supabase/email-templates/icon-source.svg
 */

const path = require('path')
const fs   = require('fs')

// ─── Tenta usar sharp ─────────────────────────────────────────────────────────
async function withSharp(sizes) {
  const sharp = require('sharp')
  const svgSource = fs.readFileSync(path.join(__dirname, '../public/icon-source.svg'))

  for (const size of sizes) {
    const outPath = path.join(__dirname, `../public/icons/icon-${size}.png`)
    await sharp(svgSource)
      .resize(size, size)
      .png()
      .toFile(outPath)
    console.log(`✅ ${outPath}`)
  }
}

// ─── Fallback: PNG mínimo válido (sem dependência externa) ────────────────────
// Gera um PNG sólido #0A0A0A com um quadrado neon no centro como placeholder.
// Para o ícone real, use sharp + icon-source.svg
const zlib = require('zlib')

function crc32(data) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function uint32BE(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n)
  return b
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii')
  const len = uint32BE(data.length)
  const crcInput = Buffer.concat([typeBytes, data])
  const crcVal = uint32BE(crc32(crcInput))
  return Buffer.concat([len, typeBytes, data, crcVal])
}

function generatePng(size) {
  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)         // width
  ihdr.writeUInt32BE(size, 4)         // height
  ihdr[8] = 8                         // bit depth
  ihdr[9] = 2                         // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0  // compression, filter, interlace

  // Pixel data: background #0A0A0A with neon #3DF710 car icon placeholder
  const rows = []
  const bg   = [0x0A, 0x0A, 0x0A]
  const neon = [0x3D, 0xF7, 0x10]
  const pad  = Math.round(size * 0.15)
  const inner = size - pad * 2

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0 // filter type None
    for (let x = 0; x < size; x++) {
      // Rounded rect background
      let color = bg
      const rx = x - size / 2
      const ry = y - size / 2
      const r  = size * 0.18  // corner radius ratio

      // Draw neon square (simplified icon body)
      if (x >= pad && x < pad + inner && y >= pad && y < pad + inner) {
        // Top/bottom bar (car body silhouette hint)
        const relY = y - pad
        const relX = x - pad
        const isTopBar    = relY < inner * 0.35
        const isBottomBar = relY >= inner * 0.65
        const isSideStrip = relX < inner * 0.1 || relX >= inner * 0.9
        if (isTopBar || isBottomBar || isSideStrip) color = neon
      }
      row[1 + x * 3]     = color[0]
      row[1 + x * 3 + 1] = color[1]
      row[1 + x * 3 + 2] = color[2]
    }
    rows.push(row)
  }

  const rawData = Buffer.concat(rows)
  const compressed = zlib.deflateSync(rawData, { level: 6 })

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ─── Main ─────────────────────────────────────────────────────────────────────
;(async () => {
  const iconsDir = path.join(__dirname, '../public/icons')
  fs.mkdirSync(iconsDir, { recursive: true })

  const sizes = [192, 512]

  // Tenta usar sharp (melhor qualidade)
  try {
    await withSharp(sizes)
    console.log('\n🎉 Ícones gerados com sharp (alta qualidade)')
    return
  } catch {
    console.log('⚠️  sharp não encontrado — gerando ícones placeholder (instale sharp para melhor qualidade)')
  }

  // Fallback: PNG placeholder
  for (const size of sizes) {
    const png = generatePng(size)
    const outPath = path.join(iconsDir, `icon-${size}.png`)
    fs.writeFileSync(outPath, png)
    console.log(`✅ Placeholder ${size}x${size} → ${outPath}`)
  }

  console.log('\n💡 Para ícones de qualidade:')
  console.log('   1. npm install -D sharp')
  console.log('   2. Coloque o SVG final em public/icon-source.svg')
  console.log('   3. node scripts/generate-pwa-icons.js')
})()
