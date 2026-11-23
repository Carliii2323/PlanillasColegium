import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { CONFIG } from './config'
import { leerArchivoExcel, type HojaLeida } from './lib/excel'
import { descargar, generarPdf, generarZip, nombrePdf, prepararDescargas } from './lib/pdf-navegador'
import { procesarHojas, type ArchivoNoReconocido, type PlanillaCurso } from './lib/procesar'

const CLAVE_DOCENTE = 'planillas.docente'

function leerGuardado(clave: string): string {
  try {
    return localStorage.getItem(clave) ?? ''
  } catch {
    return ''
  }
}

function guardar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento disponible: el nombre se pide de nuevo la próxima vez.
  }
}

export default function App() {
  const [docente, setDocente] = useState(() => leerGuardado(CLAVE_DOCENTE))
  const [anio, setAnio] = useState(() => String(new Date().getFullYear()))
  const [hojas, setHojas] = useState<HojaLeida[]>([])
  const [erroresLectura, setErroresLectura] = useState<ArchivoNoReconocido[]>([])
  const [leyendo, setLeyendo] = useState(false)
  const [generando, setGenerando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { planillas, noReconocidos } = useMemo(() => procesarHojas(hojas), [hojas])
  const rechazados = [...erroresLectura, ...noReconocidos]
  const hayArchivos = hojas.length > 0 || erroresLectura.length > 0

  useEffect(() => {
    void prepararDescargas()
  }, [])

  async function agregarArchivos(lista: FileList) {
    const archivos = Array.from(lista)
    if (archivos.length === 0) return
    setLeyendo(true)
    setError(null)
    const nuevas: HojaLeida[] = []
    const errores: ArchivoNoReconocido[] = []
    for (const archivo of archivos) {
      if (!/\.xlsx$/i.test(archivo.name)) {
        errores.push({ archivo: archivo.name, motivo: 'no es un archivo .xlsx' })
        continue
      }
      try {
        nuevas.push(...(await leerArchivoExcel(archivo.name, await archivo.arrayBuffer())))
      } catch {
        errores.push({ archivo: archivo.name, motivo: 'no se pudo leer; probá exportarlo de nuevo desde Colegium' })
      }
    }
    // Si se vuelve a cargar un archivo con el mismo nombre, reemplaza al anterior.
    const nombres = new Set(archivos.map((a) => a.name))
    setHojas((previas) => [...previas.filter((h) => !nombres.has(h.archivo)), ...nuevas])
    setErroresLectura((previos) => [...previos.filter((e) => !nombres.has(e.archivo)), ...errores])
    setLeyendo(false)
  }

  const opciones = () => ({ docente: docente.trim(), anio: anio.trim(), fecha: new Date() })

  async function descargarCurso(p: PlanillaCurso) {
    setGenerando(p.id)
    setError(null)
    try {
      await descargar(await generarPdf(p, opciones()), nombrePdf(p))
    } catch (e) {
      setError(`No se pudo generar el PDF de ${p.asignatura} (${p.curso}): ${(e as Error).message}`)
    } finally {
      setGenerando(null)
    }
  }

  async function descargarTodos() {
    setGenerando('todos')
    setError(null)
    try {
      await descargar(await generarZip(planillas, opciones()), `Planillas ${anio.trim()}.zip`)
    } catch (e) {
      setError(`No se pudieron generar los PDF: ${(e as Error).message}`)
    } finally {
      setGenerando(null)
    }
  }

  function quitarArchivos() {
    setHojas([])
    setErroresLectura([])
    setError(null)
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pt-12 pb-16 sm:px-8">
      <header>
        <h1 className="text-4xl leading-tight font-bold sm:text-5xl">Generador de Planillas de calificaciones</h1>
        <p className="mt-3 max-w-[62ch] text-lg">
          Generamos tu Planilla de Calificaciones {CONFIG.colegio}, lista para imprimir y firmar.
        </p>
        <p className="mt-1 text-lapiz"></p>
      </header>

      <section aria-label="Datos del encabezado" className="mt-10">
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <CampoLinea etiqueta="Docente:">
            <input
              value={docente}
              onChange={(e) => {
                setDocente(e.target.value)
                guardar(CLAVE_DOCENTE, e.target.value)
              }}
              placeholder="Nombre y apellido"
              autoComplete="name"
              className="w-72 max-w-full"
            />
          </CampoLinea>
          <CampoLinea etiqueta="Ciclo lectivo:">
            <input
              value={anio}
              onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              className="w-20"
            />
          </CampoLinea>
        </div>
        <p className="mt-2 text-sm text-lapiz">
          Van en el encabezado de cada hoja. 
        </p>
      </section>

      <section className="mt-8">
        <ZonaArchivos leyendo={leyendo} alSoltar={agregarArchivos} />
        <p className="mt-3 max-w-[70ch] text-sm text-lapiz">
          Por cada curso, cargá los tres Excel que exporta Colegium: Cierre de Período 1, Cierre de Período 2 y
          Planilla final. Podés cargar varios cursos juntos; se agrupan solos.
        </p>
      </section>

      {error && (
        <p role="alert" className="mt-8 border-l-4 border-corrector bg-hoja px-4 py-3 text-corrector">
          {error}
        </p>
      )}

      {planillas.length > 0 && (
        <ListaCursos
          planillas={planillas}
          generando={generando}
          alDescargar={descargarCurso}
          alDescargarTodos={descargarTodos}
        />
      )}

      {rechazados.length > 0 && (
        <section aria-labelledby="titulo-rechazados" className="mt-8 border-l-4 border-corrector bg-hoja px-5 py-4">
          <h2 id="titulo-rechazados" className="text-lg font-bold text-corrector">
            Archivos que no se usaron
          </h2>
          <ul className="mt-2 space-y-1">
            {rechazados.map((r) => (
              <li key={r.archivo}>
                <span className="font-bold break-all">{r.archivo}</span>: {r.motivo}.
              </li>
            ))}
          </ul>
        </section>
      )}

      {hayArchivos && (
        <button
          type="button"
          onClick={quitarArchivos}
          className="mt-8 text-lapiz underline underline-offset-4 hover:text-grafito"
        >
          Quitar todos los archivos
        </button>
      )}
    </main>
  )
}

/** Campo con la forma de las líneas del encabezado de la planilla ("Docente: ______"). */
function CampoLinea({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex items-baseline gap-2 text-lg font-bold [&_input]:border-b-2 [&_input]:border-grafito/60 [&_input]:bg-transparent [&_input]:px-1 [&_input]:font-normal [&_input]:outline-none [&_input]:focus-visible:border-tinta [&_input]:focus-visible:bg-tinta/5 [&_input]:focus-visible:outline-none">
      {etiqueta}
      {children}
    </label>
  )
}

const COLUMNAS_MUESTRA = ['N°', 'Apellido', 'Nombre', 'PRO - P1', 'PRO - P2', 'PROCESO', 'NF']
const FILAS_MUESTRA = 6

/** En pantallas chicas la planilla de muestra solo deja N°, Apellido, Nombre y NF. */
function claseColumnaMuestra(columna: number): string {
  const ultima = columna === COLUMNAS_MUESTRA.length - 1
  const intermedia = columna >= 3 && !ultima
  return `${ultima ? '' : 'border-r'} ${intermedia ? 'max-sm:hidden' : ''}`
}

/** Zona para soltar archivos, dibujada como una planilla en blanco. */
function ZonaArchivos({ leyendo, alSoltar }: { leyendo: boolean; alSoltar: (archivos: FileList) => void }) {
  const [encima, setEncima] = useState(false)

  const soltar = (e: DragEvent) => {
    e.preventDefault()
    setEncima(false)
    if (e.dataTransfer.files.length > 0) alSoltar(e.dataTransfer.files)
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setEncima(true)
      }}
      onDragLeave={() => setEncima(false)}
      onDrop={soltar}
      className={`relative block cursor-pointer overflow-hidden border bg-hoja transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-tinta ${
        encima ? 'border-tinta' : 'border-renglon hover:border-lapiz'
      }`}
    >
      <input
        type="file"
        accept=".xlsx"
        multiple
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) alSoltar(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        aria-hidden
        className="grid grid-cols-[2.5rem_1fr_1fr_3rem] text-sm sm:grid-cols-[2.75rem_1.3fr_1.3fr_repeat(4,minmax(3.5rem,1fr))]"
      >
        {COLUMNAS_MUESTRA.map((titulo, i) => (
          <div
            key={titulo}
            className={`truncate border-b border-renglon px-2 py-1.5 font-bold text-lapiz ${claseColumnaMuestra(i)}`}
          >
            {titulo}
          </div>
        ))}
        {Array.from({ length: FILAS_MUESTRA * COLUMNAS_MUESTRA.length }, (_, i) => {
          const fila = Math.floor(i / COLUMNAS_MUESTRA.length)
          return (
            <div
              key={i}
              className={`h-8 border-b border-renglon/60 ${claseColumnaMuestra(i % COLUMNAS_MUESTRA.length)} ${
                fila % 2 === 0 ? (encima ? 'bg-tinta/10' : 'bg-fila/60') : ''
              }`}
            />
          )
        })}
      </div>
      <div className="absolute inset-0 top-8 flex items-center justify-center p-4">
        <div className="border border-grafito bg-hoja px-7 py-5 text-center shadow-[4px_4px_0_var(--color-renglon)]">
          <p className="text-xl font-bold sm:text-2xl">
            {leyendo ? 'Leyendo archivos…' : encima ? 'Soltá para cargarlos' : 'Soltá acá los Excel de Calificaciones'}
          </p>
          <p className="mt-1 text-lapiz">
            o <span className="text-tinta underline underline-offset-4">elegí los archivos</span>
          </p>
        </div>
      </div>
    </label>
  )
}

function ListaCursos(props: {
  planillas: PlanillaCurso[]
  generando: string | null
  alDescargar: (p: PlanillaCurso) => void
  alDescargarTodos: () => void
}) {
  const { planillas, generando, alDescargar, alDescargarTodos } = props
  const ocupado = generando !== null

  return (
    <section aria-labelledby="titulo-cursos" className="mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="titulo-cursos" className="text-2xl font-bold">
          {planillas.length === 1 ? 'Un curso listo' : `${planillas.length} cursos listos`}
        </h2>
        {planillas.length > 1 && (
          <BotonTinta onClick={alDescargarTodos} disabled={ocupado}>
            {generando === 'todos' ? 'Generando…' : 'Descargar todos (.zip)'}
          </BotonTinta>
        )}
      </div>

      <table className="mt-4 w-full border-collapse border border-renglon bg-hoja text-left">
        <thead className="max-sm:sr-only">
          <tr className="border-b border-renglon text-sm text-lapiz">
            <th scope="col" className="px-4 py-2 font-bold">Asignatura y curso</th>
            <th scope="col" className="px-4 py-2 font-bold">Hojas del PDF</th>
            <th scope="col" className="px-4 py-2 text-right font-bold">Estudiantes</th>
            <th scope="col" className="px-4 py-2">
              <span className="sr-only">Descarga</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {planillas.map((p, i) => (
            <tr
              key={p.id}
              className={`border-b border-renglon align-top max-sm:block ${i % 2 === 0 ? 'bg-fila-suave' : ''}`}
            >
              <td className="px-4 py-3 max-sm:block">
                <p className="text-lg leading-snug font-bold">{p.asignatura}</p>
                <p className="text-lapiz">{p.curso}</p>
                <Notas planilla={p} />
              </td>
              <td className="px-4 py-3 max-sm:block max-sm:pt-0">
                <ul className="space-y-0.5">
                  {p.hojas.map((h) => (
                    <li key={h.titulo} className="flex items-center gap-1.5 text-tinta">
                      <Tilde /> {h.titulo}
                    </li>
                  ))}
                  {p.faltantes.map((f) => (
                    <li key={f} className="flex items-center gap-1.5 text-corrector">
                      <Cruz /> {f} <span className="text-sm">(falta el archivo)</span>
                    </li>
                  ))}
                </ul>
              </td>
              <td className="px-4 py-3 text-right text-lg tabular-nums max-sm:block max-sm:pt-0 max-sm:text-left">
                {p.cantidadEstudiantes}
                <span className="text-base text-lapiz sm:sr-only"> estudiantes</span>
              </td>
              <td className="px-4 py-3 text-right max-sm:block max-sm:pt-0 max-sm:text-left">
                <BotonTinta onClick={() => alDescargar(p)} disabled={ocupado}>
                  {generando === p.id ? 'Generando…' : 'Descargar PDF'}
                </BotonTinta>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Notas({ planilla: p }: { planilla: PlanillaCurso }) {
  const notas: ReactNode[] = []
  if (p.excluidos.length > 0) {
    notas.push(
      <>
        {p.excluidos.length === 1 ? 'No se incluye 1 estudiante' : `No se incluyen ${p.excluidos.length} estudiantes`}{' '}
        con estado distinto de «{CONFIG.estadoIncluido}»: {p.excluidos.join('; ')}.
      </>,
    )
  }
  notas.push(...p.avisos)
  if (notas.length === 0) return null
  return (
    <ul className="mt-2 max-w-[60ch] space-y-1 text-sm text-lapiz">
      {notas.map((nota, i) => (
        <li key={i}>{nota}</li>
      ))}
    </ul>
  )
}

function BotonTinta({ children, ...props }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-[3px] bg-tinta px-4 py-2 font-bold whitespace-nowrap text-white hover:bg-tinta-oscura disabled:cursor-wait disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function Tilde() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M3 8.5l3.2 3L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Cruz() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  )
}
