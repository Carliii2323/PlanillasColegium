import type { Content, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces'
import { CONFIG } from '../config'
import type { Columna, HojaPlanilla, PlanillaCurso } from './procesar'
import { altoLinea, anchoTexto, formatearFechaHora, formatearNota, lineasTexto } from './texto'

export const FUENTE_PDF = 'PlanillaSans'

export interface OpcionesPdf {
  colegio: string
  docente: string
  anio: number | string
  fecha: Date
}

// Todo en puntos (1 pt = 1/72"). Los tamaños base salen del formato de Excel.
const HOJAS = { A4: [595.28, 841.89], LETTER: [612, 792], LEGAL: [612, 1008] } as const
const MARGEN = { horizontal: 18, vertical: 22 } // 0,25" a los costados, como el formato
const TAMANO = { titulo: 14, encabezadoClave: 14, encabezadoItem: 11, celda: 11 }
const RELLENO = { horizontal: 4, vertical: 1 }
const LINEA = 0.5
const ESPACIO = { antesTabla: 6, antesFecha: 10, antesFirma: 18 }
const ANCHO_MINIMO_NOTA = 26
const ESCALA_MINIMA = 0.64 // letra de 7 pt; más chica ya cuesta leerla
const ESCALA_SI_NO_ENTRA = 0.8
const MARGEN_SEGURIDAD = 3

/** Escala de letra y anchos de columna elegidos para que la hoja entre en una página. */
interface Diseno {
  escala: number
  anchos: number[]
}

const suma = (valores: number[]) => valores.reduce((a, b) => a + b, 0)
const tamanoEncabezado = (c: Columna, escala: number) =>
  (c.estilo === 'clave' ? TAMANO.encabezadoClave : TAMANO.encabezadoItem) * escala

function textosTitulo(p: PlanillaCurso, hoja: HojaPlanilla, o: OpcionesPdf): string[] {
  return [
    `Nombre del Colegio: ${o.colegio}`.trim(),
    `${CONFIG.tituloPlanilla} ${p.asignatura} (${o.anio})`,
    `Docente: ${o.docente}`.trim(),
    `Curso: ${p.curso}`.trim(),
    hoja.titulo,
  ]
}

/** Anchos de contenido de cada columna (sin relleno ni bordes), o null si no entran. */
function calcularAnchos(hoja: HojaPlanilla, escala: number, anchoUtil: number, forzar = false): number[] | null {
  const disponible = anchoUtil - hoja.columnas.length * (2 * RELLENO.horizontal * escala + LINEA) - LINEA

  const naturales = hoja.columnas.map((c, j) => {
    const contenido = Math.max(0, ...hoja.filas.map((f) => anchoTexto(formatearNota(f[j]), TAMANO.celda * escala)))
    if (c.estilo === 'clave') return Math.max(contenido, anchoTexto(c.titulo, tamanoEncabezado(c, escala), true))
    // El título de una nota parcial puede ir en dos líneas, pero sin cortar palabras.
    const palabra = Math.max(...c.titulo.split(' ').map((p) => anchoTexto(p, tamanoEncabezado(c, escala))))
    return Math.max(contenido, palabra, ANCHO_MINIMO_NOTA * escala)
  })
  // Lo ideal es que el título de cada nota parcial entre en una sola línea.
  const preferidos = hoja.columnas.map((c, j) =>
    c.estilo === 'item' ? Math.max(naturales[j], anchoTexto(c.titulo, tamanoEncabezado(c, escala))) : naturales[j],
  )

  const totalNatural = suma(naturales)
  if (totalNatural > disponible) {
    if (!forzar) return null
    return naturales.map((w) => (w * disponible) / totalNatural)
  }
  const totalPreferido = suma(preferidos)
  if (totalPreferido <= disponible) {
    // Sobra lugar: se reparte en proporción (menos la columna N°) para ocupar todo el ancho.
    const sobrante = disponible - totalPreferido
    const repartible = totalPreferido - preferidos[0]
    return preferidos.map((w, j) => (j === 0 ? w : w + (sobrante * w) / repartible))
  }
  // No hay lugar para todo en una línea: el sobrante va a las notas parciales que más lo necesitan.
  const sobrante = disponible - totalNatural
  const faltante = totalPreferido - totalNatural
  return naturales.map((w, j) => w + (sobrante * (preferidos[j] - w)) / faltante)
}

function altoHoja(p: PlanillaCurso, hoja: HojaPlanilla, o: OpcionesPdf, d: Diseno, anchoUtil: number): number {
  const { escala, anchos } = d
  const lineaTitulo = altoLinea(TAMANO.titulo * escala)
  const titulos = suma(textosTitulo(p, hoja, o).map((t) => lineasTexto(t, TAMANO.titulo * escala, anchoUtil, true) * lineaTitulo))
  const relleno = 2 * RELLENO.vertical * escala + LINEA
  const encabezado =
    Math.max(
      ...hoja.columnas.map(
        (c, j) =>
          lineasTexto(c.titulo, tamanoEncabezado(c, escala), anchos[j], c.estilo === 'clave') *
          altoLinea(tamanoEncabezado(c, escala)),
      ),
    ) + relleno
  const fila = altoLinea(TAMANO.celda * escala) + relleno
  const pie = 2 * lineaTitulo + (ESPACIO.antesFecha + ESPACIO.antesFirma) * escala
  return titulos + ESPACIO.antesTabla * escala + encabezado + hoja.filas.length * fila + LINEA + pie
}

/** Achica la letra de a poco hasta que la hoja entra en una página (como "Ajustar a una página" de Excel). */
function disenar(p: PlanillaCurso, hoja: HojaPlanilla, o: OpcionesPdf, anchoUtil: number, altoUtil: number): Diseno {
  for (let escala = 1; escala >= ESCALA_MINIMA; escala = Math.round((escala - 0.02) * 100) / 100) {
    const anchos = calcularAnchos(hoja, escala, anchoUtil)
    if (anchos && altoHoja(p, hoja, o, { escala, anchos }, anchoUtil) <= altoUtil - MARGEN_SEGURIDAD) {
      return { escala, anchos }
    }
  }
  // Curso muy grande (más de ~45): en vez de letra diminuta, la tabla sigue en otra
  // página con el encabezado repetido.
  return { escala: ESCALA_SI_NO_ENTRA, anchos: calcularAnchos(hoja, ESCALA_SI_NO_ENTRA, anchoUtil, true)! }
}

function contenidoHoja(p: PlanillaCurso, hoja: HojaPlanilla, o: OpcionesPdf, d: Diseno, nuevaPagina: boolean): Content[] {
  const { escala, anchos } = d
  const encabezado: TableCell[] = hoja.columnas.map((c) => ({
    text: c.titulo,
    bold: c.estilo === 'clave',
    fontSize: tamanoEncabezado(c, escala),
    alignment: c.alineacion,
  }))
  const filas: TableCell[][] = hoja.filas.map((fila) =>
    fila.map((valor, j) => ({ text: formatearNota(valor), alignment: hoja.columnas[j].alineacion })),
  )

  return [
    {
      stack: textosTitulo(p, hoja, o).map((text) => ({ text })),
      fontSize: TAMANO.titulo * escala,
      bold: true,
      ...(nuevaPagina ? { pageBreak: 'before' as const } : {}),
    },
    {
      table: { headerRows: 1, widths: anchos, body: [encabezado, ...filas] },
      layout: {
        hLineWidth: () => LINEA,
        vLineWidth: () => LINEA,
        hLineColor: () => '#000000',
        vLineColor: () => '#000000',
        paddingLeft: () => RELLENO.horizontal * escala,
        paddingRight: () => RELLENO.horizontal * escala,
        paddingTop: () => RELLENO.vertical * escala,
        paddingBottom: () => RELLENO.vertical * escala,
        // Filas alternadas: la primera de datos en gris, como el formato.
        fillColor: (fila: number) => (fila > 0 && fila % 2 === 1 ? CONFIG.colorFilaGris : null),
      },
      fontSize: TAMANO.celda * escala,
      margin: [0, ESPACIO.antesTabla * escala, 0, 0],
    },
    {
      stack: [
        { text: `${CONFIG.textos.fechaImpresion}: ${formatearFechaHora(o.fecha)}` },
        { text: CONFIG.textos.firma, margin: [0, ESPACIO.antesFirma * escala, 0, 0] },
      ],
      fontSize: TAMANO.titulo * escala,
      bold: true,
      margin: [0, ESPACIO.antesFecha * escala, 0, 0],
      unbreakable: true,
    },
  ]
}

/** Arma la definición del PDF de un curso: una página apaisada por hoja. */
export function crearDocumento(p: PlanillaCurso, o: OpcionesPdf): TDocumentDefinitions {
  const [corto, largo] = HOJAS[CONFIG.tamanoHoja]
  const anchoUtil = largo - 2 * MARGEN.horizontal
  const altoUtil = corto - 2 * MARGEN.vertical

  return {
    pageSize: CONFIG.tamanoHoja,
    pageOrientation: 'landscape',
    pageMargins: [MARGEN.horizontal, MARGEN.vertical, MARGEN.horizontal, MARGEN.vertical],
    defaultStyle: { font: FUENTE_PDF },
    info: {
      title: `${CONFIG.tituloPlanilla} ${p.asignatura} - ${p.curso}`,
      author: o.docente || o.colegio || undefined,
      creator: 'Planillas de calificaciones',
    },
    content: p.hojas.flatMap((hoja, i) =>
      contenidoHoja(p, hoja, o, disenar(p, hoja, o, anchoUtil, altoUtil), i > 0),
    ),
  }
}

/** Para mostrar en pantalla y nombrar el archivo. */
export function escalaDeHojas(p: PlanillaCurso, o: OpcionesPdf): number[] {
  const [corto, largo] = HOJAS[CONFIG.tamanoHoja]
  return p.hojas.map((h) => disenar(p, h, o, largo - 2 * MARGEN.horizontal, corto - 2 * MARGEN.vertical).escala)
}
