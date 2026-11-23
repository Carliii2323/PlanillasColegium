import { CONFIG } from '../config'
import type { Celda, HojaLeida } from './excel'
import { limpiarCurso, limpiarEspacios, normalizar, separarNombre } from './texto'

export type Valor = string | number | null

/** 'clave': encabezado en negrita grande (N°, Apellido, PROCESO...). 'item': notas parciales. */
export type EstiloColumna = 'clave' | 'item'

export interface Columna {
  titulo: string
  estilo: EstiloColumna
  alineacion: 'left' | 'center'
}

/** Una hoja del PDF (Notas Definitivas, Periodo 1, Periodo 2...). */
export interface HojaPlanilla {
  titulo: string
  archivo: string
  columnas: Columna[]
  filas: Valor[][]
}

/** Todo lo de un curso + asignatura: sale en un PDF. */
export interface PlanillaCurso {
  id: string
  curso: string
  asignatura: string
  hojas: HojaPlanilla[]
  faltantes: string[]
  excluidos: string[]
  avisos: string[]
  cantidadEstudiantes: number
}

export interface ArchivoNoReconocido {
  archivo: string
  motivo: string
}

export interface ResultadoProceso {
  planillas: PlanillaCurso[]
  noReconocidos: ArchivoNoReconocido[]
}

type Tipo = { clase: 'final'; numero: 0 } | { clase: 'periodo'; numero: number }

interface ColumnaOrigen extends Columna {
  indice: number
  /** Si es false, la columna solo sale cuando algún estudiante tiene nota. */
  siempre: boolean
}

interface Estudiante {
  clave: string
  apellido: string
  nombre: string
  valores: Valor[]
}

interface HojaInterpretada {
  id: string
  curso: string
  asignatura: string
  archivo: string
  tipo: Tipo
  columnas: ColumnaOrigen[]
  estudiantes: Estudiante[]
  excluidos: string[]
}

const COLUMNAS_BASE: Columna[] = [
  { titulo: 'N°', estilo: 'clave', alineacion: 'center' },
  { titulo: 'Apellido', estilo: 'clave', alineacion: 'left' },
  { titulo: 'Nombre', estilo: 'clave', alineacion: 'left' },
]

const item = (titulo: string, siempre = false) =>
  ({ titulo, estilo: 'item', alineacion: 'center', siempre }) as const
const clave = (titulo: string) => ({ titulo, estilo: 'clave', alineacion: 'center', siempre: true }) as const

/** Columnas del Cierre de Período de Colegium -> columnas del formato. */
function columnaDePeriodo(encabezado: Celda) {
  const e = normalizar(encabezado)
  let m: RegExpMatchArray | null
  if ((m = e.match(/^p(\d+)\b/))) return item(`PRO - P${m[1]}`)
  if (/^ter\b/.test(e)) return item('PRO - TER')
  if (/^pro\b/.test(e)) return clave('PROCESO')
  if ((m = e.match(/^r(\d+)\b/))) return item(`RES - R${m[1]}`)
  if (/^res\b/.test(e)) return clave('RESULTADO')
  if (/^final\b/.test(e)) return clave('NF')
  return null
}

/** Columnas de la Planilla final de Colegium -> columnas del formato. */
function columnaDeFinal(encabezado: Celda) {
  const e = normalizar(encabezado)
  const m = e.match(/^periodo (\d+)$/)
  if (m) return item(`Calificación final - Periodo ${m[1]}`, true)
  if (e === 'calificacion final') return clave('Calificación final')
  if (e.startsWith('definitiva')) return clave('Calificación definitiva')
  return null // Diciembre, Febrero, Marzo e Intensificación no van en el formato
}

function buscarFilaEncabezado(filas: Celda[][]): number {
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const celdas = filas[i].map(normalizar)
    if (celdas.includes('estudiante') && celdas.includes('estado')) return i
  }
  return -1
}

function detectarTipo(hoja: HojaLeida, encabezados: string[]): Tipo | null {
  if (encabezados.includes('calificacion final') && encabezados.some((e) => e.startsWith('definitiva'))) {
    return { clase: 'final', numero: 0 }
  }
  const esPeriodo = encabezados.some((e) => /^pro\b/.test(e)) && encabezados.some((e) => /^final\b/.test(e))
  if (!esPeriodo) return null
  const m = normalizar(hoja.hoja).match(/periodo (\d+)/) ?? normalizar(hoja.archivo).match(/periodo (\d+)/)
  return m ? { clase: 'periodo', numero: Number(m[1]) } : null
}

function aValor(celda: Celda): Valor {
  if (celda === null || celda === undefined) return null
  if (typeof celda === 'number') return Number.isFinite(celda) ? celda : null
  if (typeof celda === 'boolean') return celda ? 'Sí' : 'No'
  if (celda instanceof Date) return celda.toLocaleDateString('es-AR')
  const texto = limpiarEspacios(celda)
  if (texto === '') return null
  return /^-?\d+([.,]\d+)?$/.test(texto) ? Number(texto.replace(',', '.')) : texto
}

function tituloDeTipo(tipo: Tipo): string {
  return tipo.clase === 'final' ? CONFIG.textos.notasDefinitivas : CONFIG.textos.periodo(tipo.numero)
}

/** Interpreta una hoja de Colegium. Devuelve un texto con el motivo si no la reconoce. */
function interpretarHoja(hoja: HojaLeida): HojaInterpretada[] | string {
  const filaEncabezado = buscarFilaEncabezado(hoja.filas)
  if (filaEncabezado < 0) return 'no tiene las columnas Estudiante y Estado'

  const encabezados = hoja.filas[filaEncabezado].map(normalizar)
  const tipo = detectarTipo(hoja, encabezados)
  if (!tipo) return 'no parece una exportación de Calificaciones de Colegium (Cierre de Período o Planilla final)'

  const iEstudiante = encabezados.indexOf('estudiante')
  const iEstado = encabezados.indexOf('estado')
  const iCurso = encabezados.indexOf('curso')
  const iAsignatura = encabezados.indexOf('asignatura')
  if (iCurso < 0 || iAsignatura < 0) return 'le faltan las columnas Curso o Asignatura'

  const mapear = tipo.clase === 'final' ? columnaDeFinal : columnaDePeriodo
  const columnas: ColumnaOrigen[] = []
  hoja.filas[filaEncabezado].forEach((encabezado, indice) => {
    const columna = mapear(encabezado)
    if (columna) columnas.push({ ...columna, indice })
  })

  // Una hoja podría traer más de un curso: se separan por Curso + Asignatura.
  const grupos = new Map<string, HojaInterpretada>()
  for (const fila of hoja.filas.slice(filaEncabezado + 1)) {
    const estudiante = limpiarEspacios(fila[iEstudiante])
    if (!estudiante) continue
    const curso = limpiarCurso(String(fila[iCurso] ?? ''))
    const asignatura = limpiarEspacios(fila[iAsignatura])
    const id = `${normalizar(asignatura)}|${normalizar(curso)}`

    let grupo = grupos.get(id)
    if (!grupo) {
      grupo = { id, curso, asignatura, archivo: hoja.archivo, tipo, columnas, estudiantes: [], excluidos: [] }
      grupos.set(id, grupo)
    }
    if (normalizar(fila[iEstado]) !== normalizar(CONFIG.estadoIncluido)) {
      grupo.excluidos.push(estudiante)
      continue
    }
    const { apellido, nombre } = separarNombre(estudiante)
    grupo.estudiantes.push({
      clave: normalizar(estudiante),
      apellido,
      nombre,
      valores: columnas.map((c) => aValor(fila[c.indice])),
    })
  }
  return grupos.size > 0 ? [...grupos.values()] : 'no tiene estudiantes'
}

function construirHoja(h: HojaInterpretada): HojaPlanilla {
  const visibles = h.columnas
    .map((columna, i) => ({ columna, i }))
    .filter(({ columna, i }) => columna.siempre || h.estudiantes.some((e) => e.valores[i] !== null))

  return {
    titulo: tituloDeTipo(h.tipo),
    archivo: h.archivo,
    columnas: [
      ...COLUMNAS_BASE,
      ...visibles.map(({ columna }) => ({
        titulo: columna.titulo,
        estilo: columna.estilo,
        alineacion: columna.alineacion,
      })),
    ],
    filas: h.estudiantes.map((e, n) => [n + 1, e.apellido, e.nombre, ...visibles.map(({ i }) => e.valores[i])]),
  }
}

function compararListas(a: HojaInterpretada, b: HojaInterpretada): string | null {
  const enA = new Set(a.estudiantes.map((e) => e.clave))
  const enB = new Set(b.estudiantes.map((e) => e.clave))
  const soloA = [...enA].filter((c) => !enB.has(c)).length
  const soloB = [...enB].filter((c) => !enA.has(c)).length
  if (soloA === 0 && soloB === 0) return null
  return `La lista de estudiantes de ${tituloDeTipo(b.tipo)} no coincide con la de ${tituloDeTipo(a.tipo)}.`
}

/** Reconoce las hojas, las agrupa por curso y arma las planillas con el formato. */
export function procesarHojas(hojas: HojaLeida[]): ResultadoProceso {
  const noReconocidos: ArchivoNoReconocido[] = []
  const cursos = new Map<string, Map<string, HojaInterpretada>>()
  const avisos = new Map<string, string[]>()

  const porArchivo = new Map<string, HojaLeida[]>()
  for (const hoja of hojas) porArchivo.set(hoja.archivo, [...(porArchivo.get(hoja.archivo) ?? []), hoja])

  for (const [archivo, hojasDelArchivo] of porArchivo) {
    const motivos: string[] = []
    let reconocidas = 0
    for (const hoja of hojasDelArchivo) {
      const resultado = interpretarHoja(hoja)
      if (typeof resultado === 'string') {
        motivos.push(resultado)
        continue
      }
      reconocidas += 1
      for (const h of resultado) {
        const clave = h.tipo.clase === 'final' ? 'final' : `periodo-${h.tipo.numero}`
        const delCurso = cursos.get(h.id) ?? new Map<string, HojaInterpretada>()
        cursos.set(h.id, delCurso)
        const anterior = delCurso.get(clave)
        if (anterior) {
          const lista = avisos.get(h.id) ?? []
          lista.push(`${tituloDeTipo(h.tipo)} vino en dos archivos; se usa "${h.archivo}" y se descarta "${anterior.archivo}".`)
          avisos.set(h.id, lista)
        }
        delCurso.set(clave, h)
      }
    }
    if (reconocidas === 0) noReconocidos.push({ archivo, motivo: motivos[0] ?? 'no tiene hojas' })
  }

  const planillas: PlanillaCurso[] = [...cursos.entries()].map(([id, delCurso]) => {
    // Primero Notas Definitivas (número 0) y después los períodos en orden, como el formato.
    const hojasCurso = [...delCurso.values()].sort((a, b) => a.tipo.numero - b.tipo.numero)
    const periodos = hojasCurso.filter((h) => h.tipo.clase === 'periodo').map((h) => h.tipo.numero)

    const faltantes: string[] = []
    if (!delCurso.has('final')) faltantes.push(CONFIG.textos.notasDefinitivas)
    for (const n of [...new Set([1, 2, ...periodos])].sort((a, b) => a - b)) {
      if (!delCurso.has(`periodo-${n}`)) faltantes.push(CONFIG.textos.periodo(n))
    }

    const avisosCurso = [...(avisos.get(id) ?? [])]
    for (const h of hojasCurso.slice(1)) {
      const diferencia = compararListas(hojasCurso[0], h)
      if (diferencia) avisosCurso.push(diferencia)
    }
    if (hojasCurso.every((h) => h.estudiantes.length === 0)) avisosCurso.push('No hay estudiantes activos.')

    return {
      id,
      curso: hojasCurso[0].curso,
      asignatura: hojasCurso[0].asignatura,
      hojas: hojasCurso.map(construirHoja),
      faltantes,
      excluidos: [...new Set(hojasCurso.flatMap((h) => h.excluidos))].sort((a, b) => a.localeCompare(b, 'es')),
      avisos: avisosCurso,
      cantidadEstudiantes: Math.max(...hojasCurso.map((h) => h.estudiantes.length)),
    }
  })

  planillas.sort((a, b) => a.asignatura.localeCompare(b.asignatura, 'es') || a.curso.localeCompare(b.curso, 'es'))
  return { planillas, noReconocidos }
}
