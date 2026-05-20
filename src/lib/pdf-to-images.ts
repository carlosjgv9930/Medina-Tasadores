// @ts-nocheck
// Este archivo convierte páginas de PDF a imágenes JPEG en el navegador.
// Usa @ts-nocheck porque pdfjs-dist tiene tipos complejos que no son necesarios validar.

export async function pdfToImages(file: File): Promise<string[]> {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

    const buffer = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: buffer }).promise
    const numPages = Math.min(pdf.numPages, 4)
    const images = []

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i)
      const viewport = page.getViewport({ scale: 2.0 })
      const canvas = document.createElement('canvas')
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      await page.render({ canvasContext: ctx, viewport }).promise
      images.push(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
      canvas.remove()
    }

    return images
  } catch (err) {
    console.error('[pdfToImages] Error:', err)
    return []
  }
}
