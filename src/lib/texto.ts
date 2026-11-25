import { ALTO_LINEA, ANCHOS_BOLD, ANCHOS_REGULAR, CARACTERES_BOLD, CARACTERES_REGULAR } from './anchos-fuente'

/** Minúsculas, sin tildes ni símbolos: "Calificación final" -> "calificacion final". */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Une espacios repetidos y recorta los bordes. */
export function limpiarEspacios(texto: unknown): string {
  return String(texto ?? '').replace(/\s+/g, ' ').trim()
}

/** "Agüero , Emma Sofia" -> { apellido: "Agüero", nombre: "Emma Sofia" } */
export function separarNombre(estudiante: string): { apellido: string; nombre: string } {
  const coma = estudiante.indexOf(',')
  if (coma < 0) return { apellido: limpiarEspacios(estudiante), nombre: '' }
  return {
    apellido: limpiarEspacios(estudiante.slice(0, coma)),
    nombre: limpiarEspacios(estudiante.slice(coma + 1)),
  }
}

/** Año + división de un curso, con o sin espacio y "°": "1 H1", "1° H1", "3CN". */
const CODIGO_CURSO = /(\d+)\s*[°º]?\s*([A-Za-z]+\d*)/g

/**
 * Deja el curso listo para mostrar. Colegium repite el curso en la misma celda, a veces
 * escrito distinto ("1 H1 1° H1" -> "1H1"). Si la celda trae varios cursos ("3H2 3CN",
 * "3H2/3CN"), quedan separados por coma y sin repetir: "3H2, 3CN".
 */
export function limpiarCurso(curso: string): string {
  const texto = limpiarEspacios(curso)
  const codigos = [...texto.matchAll(CODIGO_CURSO)].map((m) => `${m[1]}${m[2].toUpperCase()}`)
  // Solo si la celda es nada más que códigos de curso y separadores.
  const sobra = texto.replace(CODIGO_CURSO, '').replace(/[\s,;/]+/g, '')
  if (codigos.length > 0 && sobra === '') return [...new Set(codigos)].join(', ')

  // Nombre de curso con espacios ("3° Año A 3° Año A"): solo se quita la repetición.
  const palabras = texto.split(' ')
  const mitad = palabras.length / 2
  if (Number.isInteger(mitad) && palabras.slice(0, mitad).join(' ') === palabras.slice(mitad).join(' ')) {
    return palabras.slice(0, mitad).join(' ')
  }
  return texto
}

const formatoNota = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2, useGrouping: false })

/** 9.5 -> "9,5"; 10 -> "10"; vacío -> "". */
export function formatearNota(valor: string | number | null): string {
  if (valor === null) return ''
  return typeof valor === 'number' ? formatoNota.format(valor) : valor
}

/** dd/mm/aaaa hh:mm, como en el formato. */
export function formatearFechaHora(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
}

/** Quita caracteres que Windows no acepta en nombres de archivo. */
export function nombreDeArchivo(texto: string): string {
  return limpiarEspacios(texto.replace(/[\\/:*?"<>|]+/g, ' '))
}

// ---------- Medición de texto con las métricas reales de la fuente ----------

function tablaAnchos(caracteres: string, anchos: number[]): Map<string, number> {
  const tabla = new Map<string, number>()
  Array.from(caracteres).forEach((c, i) => tabla.set(c, anchos[i]))
  return tabla
}

const ANCHO_REGULAR = tablaAnchos(CARACTERES_REGULAR, ANCHOS_REGULAR)
const ANCHO_NEGRITA = tablaAnchos(CARACTERES_BOLD, ANCHOS_BOLD)

/** Ancho en puntos de un texto de una línea. */
export function anchoTexto(texto: string, puntos: number, negrita = false): number {
  const tabla = negrita ? ANCHO_NEGRITA : ANCHO_REGULAR
  let milesimas = 0
  for (const c of texto) milesimas += tabla.get(c) ?? 600
  return (milesimas / 1000) * puntos
}

/** Cantidad de líneas que ocupa un texto al cortarlo por palabras en un ancho dado. */
export function lineasTexto(texto: string, puntos: number, ancho: number, negrita = false): number {
  const espacio = anchoTexto(' ', puntos, negrita)
  let lineas = 1
  let actual = 0
  for (const palabra of texto.split(' ')) {
    const w = anchoTexto(palabra, puntos, negrita)
    if (actual > 0 && actual + espacio + w > ancho) {
      lineas += 1
      actual = w
    } else {
      actual += (actual > 0 ? espacio : 0) + w
    }
  }
  return lineas
}

/** Alto en puntos de una línea de texto. */
export function altoLinea(puntos: number): number {
  return puntos * ALTO_LINEA
}
