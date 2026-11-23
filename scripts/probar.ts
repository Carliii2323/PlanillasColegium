// Prueba sin navegador: genera los PDF de los Excel que le pases.
// Uso: npx tsx scripts/probar.ts carpeta-salida archivo1.xlsx archivo2.xlsx ...
import { mkdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import pdfmake from 'pdfmake'
import { leerArchivoExcel } from '../src/lib/excel'
import { crearDocumento, escalaDeHojas, FUENTE_PDF } from '../src/lib/pdf'
import { procesarHojas } from '../src/lib/procesar'
import { nombreDeArchivo } from '../src/lib/texto'

const [salida, ...archivos] = process.argv.slice(2)
if (!salida || archivos.length === 0) {
  console.error('Uso: npx tsx scripts/probar.ts carpeta-salida archivo1.xlsx archivo2.xlsx ...')
  process.exit(1)
}

const fuentes = resolve(import.meta.dirname, '../src/assets/fuentes')
pdfmake.setFonts({
  [FUENTE_PDF]: {
    normal: join(fuentes, 'PlanillaSans-Regular.ttf'),
    bold: join(fuentes, 'PlanillaSans-Bold.ttf'),
    italics: join(fuentes, 'PlanillaSans-Regular.ttf'),
    bolditalics: join(fuentes, 'PlanillaSans-Bold.ttf'),
  },
})
pdfmake.setUrlAccessPolicy(() => false)
pdfmake.setLocalAccessPolicy((ruta) => resolve(ruta).startsWith(fuentes))

const hojas = []
for (const archivo of archivos) {
  const datos = readFileSync(archivo)
  const buffer = datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer
  hojas.push(...(await leerArchivoExcel(basename(archivo), buffer)))
}

const { planillas, noReconocidos } = procesarHojas(hojas)
for (const n of noReconocidos) console.log(`No reconocido: ${n.archivo} (${n.motivo})`)

mkdirSync(salida, { recursive: true })
const opciones = { docente: process.env.DOCENTE ?? '', anio: new Date().getFullYear(), fecha: new Date() }
for (const p of planillas) {
  const destino = join(salida, `${nombreDeArchivo(`Planilla - ${p.asignatura} - ${p.curso}`)}.pdf`)
  await pdfmake.createPdf(crearDocumento(p, opciones)).write(destino)
  console.log(`${p.asignatura} | ${p.curso} | ${p.cantidadEstudiantes} estudiantes | excluidos: ${p.excluidos.length}`)
  for (const h of p.hojas) console.log(`  ${h.titulo}: ${h.columnas.map((c) => c.titulo).join(' | ')}`)
  console.log(`  escala por hoja: ${escalaDeHojas(p, opciones).join(', ')}`)
  if (p.faltantes.length) console.log(`  faltan: ${p.faltantes.join(', ')}`)
  for (const a of p.avisos) console.log(`  aviso: ${a}`)
  console.log(`  -> ${destino}`)
}
