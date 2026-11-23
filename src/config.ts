// Datos fijos de la planilla. Cambiá acá los textos sin tocar el resto del código.
export const CONFIG = {
  tituloPlanilla: 'Planilla de Seguimiento',

  /** Solo entran estudiantes con este estado; el resto se excluye. */
  estadoIncluido: 'Activo',

  /** Tamaño de hoja del PDF (siempre apaisado). */
  tamanoHoja: 'A4' as 'A4' | 'LETTER' | 'LEGAL',

  /** Gris de las filas alternadas, igual al formato. */
  colorFilaGris: '#E0E0E0',

  textos: {
    notasDefinitivas: 'Notas Definitivas',
    periodo: (numero: number) => `Periodo ${numero}`,
    fechaImpresion: 'Fecha de Impresión',
    firma: 'Firma Docente: ___________________________',
  },
} as const
