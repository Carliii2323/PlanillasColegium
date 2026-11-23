import pdfMake from 'pdfmake/build/pdfmake'
import { zipSync } from 'fflate'
import regular from '../assets/fuentes/PlanillaSans-Regular.ttf?inline'
import negrita from '../assets/fuentes/PlanillaSans-Bold.ttf?inline'
import { crearDocumento, FUENTE_PDF, type OpcionesPdf } from './pdf'
import type { PlanillaCurso } from './procesar'
import { nombreDeArchivo } from './texto'

let fuentesListas = false

/** Carga la fuente dentro de pdfmake (va incluida en la página, no se descarga de internet). */
function prepararFuentes() {
  if (fuentesListas) return
  const base64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1)
  pdfMake.addVirtualFileSystem({
    'PlanillaSans-Regular.ttf': base64(regular),
    'PlanillaSans-Bold.ttf': base64(negrita),
  })
  pdfMake.setFonts({
    [FUENTE_PDF]: {
      normal: 'PlanillaSans-Regular.ttf',
      bold: 'PlanillaSans-Bold.ttf',
      italics: 'PlanillaSans-Regular.ttf',
      bolditalics: 'PlanillaSans-Bold.ttf',
    },
  })
  fuentesListas = true
}

export function nombrePdf(p: PlanillaCurso): string {
  return `${nombreDeArchivo(`Planilla - ${p.asignatura} - ${p.curso}`)}.pdf`
}

export async function generarPdf(p: PlanillaCurso, opciones: OpcionesPdf): Promise<Blob> {
  prepararFuentes()
  return pdfMake.createPdf(crearDocumento(p, opciones)).getBlob()
}

/** Un .zip con un PDF por curso. Los PDF ya vienen comprimidos, así que solo se empaquetan. */
export async function generarZip(planillas: PlanillaCurso[], opciones: OpcionesPdf): Promise<Blob> {
  const archivos: Record<string, Uint8Array> = {}
  for (const p of planillas) {
    let nombre = nombrePdf(p)
    for (let n = 2; nombre in archivos; n++) nombre = nombrePdf(p).replace(/\.pdf$/, ` (${n}).pdf`)
    archivos[nombre] = new Uint8Array(await (await generarPdf(p, opciones)).arrayBuffer())
  }
  const zip = zipSync(archivos, { level: 0 })
  return new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' })
}

// Dentro de claude.ai la página corre en un marco que no deja descargar con <a download>;
// ahí se usa la función de descargas que ofrece el visor. En cualquier otro hosting
// (GitHub Pages, Cloudflare, abriendo el archivo) `window.claude` no existe.
interface DescargasClaude {
  save(pedido: { filename: string; data: Blob }): Promise<unknown>
}
type VisorClaude = { use(capacidad: string): Promise<unknown> }

let descargasClaude: Promise<DescargasClaude | null> | null = null

function visorClaude(): VisorClaude | undefined {
  return (window as unknown as { claude?: VisorClaude }).claude
}

/** Se llama al abrir la página para que la descarga no espere después. */
export function prepararDescargas(): Promise<DescargasClaude | null> {
  const visor = visorClaude()
  if (!visor?.use) return Promise.resolve(null)
  descargasClaude ??= visor
    .use('downloads')
    .then((d) => (d as DescargasClaude | null) ?? null)
    .catch(() => null)
  return descargasClaude
}

/** Descarga un archivo generado. Devuelve false si la persona canceló. */
export async function descargar(blob: Blob, nombre: string): Promise<boolean> {
  if (visorClaude()?.use) {
    const descargas = await prepararDescargas()
    if (!descargas) throw new Error('esta vista no permite descargar archivos')
    try {
      await descargas.save({ filename: nombre, data: blob })
      return true
    } catch (e) {
      if ((e as { code?: string }).code === 'declined') return false
      throw new Error((e as { message?: string }).message ?? 'no se pudo guardar el archivo')
    }
  }

  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return true
}
