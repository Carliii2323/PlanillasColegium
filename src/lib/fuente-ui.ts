import regular from '../assets/fuentes/PlanillaSans-Regular.ttf?inline'
import negrita from '../assets/fuentes/PlanillaSans-Bold.ttf?inline'

/** Registra la letra de la planilla para la interfaz (sin descargar nada de internet). */
export function registrarFuenteUi() {
  if (typeof FontFace === 'undefined') return
  for (const [archivo, peso] of [[regular, '400'], [negrita, '700']] as const) {
    const fuente = new FontFace('Planilla Sans', `url(${archivo})`, { weight: peso })
    fuente
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => {
        /* Si falla, se usa la letra del sistema. */
      })
  }
}
