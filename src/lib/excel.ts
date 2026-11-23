import leerLibro from 'read-excel-file/universal'

export type Celda = string | number | boolean | Date | null | undefined

export interface HojaLeida {
  archivo: string
  hoja: string
  filas: Celda[][]
}

/** Lee todas las hojas de un .xlsx. Funciona igual en el navegador y en Node. */
export async function leerArchivoExcel(archivo: string, contenido: ArrayBuffer): Promise<HojaLeida[]> {
  const hojas = await leerLibro(contenido)
  return hojas.map((h) => ({ archivo, hoja: h.sheet, filas: h.data as Celda[][] }))
}
