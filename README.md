# Planillas de calificaciones

Página web que toma los Excel de **Calificaciones** que exporta Colegium y arma la planilla de la
Escuela del Magisterio en PDF, lista para imprimir y firmar.

Todo pasa en el navegador: los Excel no se suben a ningún servidor.

## Cómo se usa

1. Escribir el nombre del docente y el ciclo lectivo (van en el encabezado).
2. Arrastrar los Excel de cada curso: Cierre de Período 1, Cierre de Período 2 y Planilla final.
   Se pueden cargar varios cursos juntos: se agrupan por Curso + Asignatura.
3. Descargar el PDF de cada curso, o todos juntos en un .zip.

Cada PDF tiene tres páginas apaisadas: Notas Definitivas, Periodo 1 y Periodo 2.

## Reglas que aplica

- Solo entran los estudiantes con estado «Activo».
- "Apellido, Nombre" se separa en dos columnas y se numera de nuevo desde 1.
- En los períodos solo salen las columnas P, TER y R que tienen al menos una nota;
  PROCESO, RESULTADO y NF salen siempre.
- Diciembre, Febrero, Marzo e Intensificación no van en la planilla.
- No recalcula nada: copia las notas tal como vienen de Colegium (con coma decimal).
- Si un curso entra en una hoja achicando la letra, la achica (como "Ajustar a una página" de Excel);
  con más de ~42 estudiantes la tabla sigue en otra página y repite el encabezado.

## Desarrollo

Requiere Node 20.19 o más nuevo (o 22.12+).

```bash
npm install
npm run dev      # abre la página en http://localhost:5173
npm run build    # genera dist/index.html (un solo archivo con todo adentro)
```

Probar sin navegador (genera los PDF en una carpeta):

```bash
npx tsx scripts/probar.ts salida/ ruta/a/los/*.xlsx
```

### Dónde está cada cosa

| Archivo | Qué hace |
| --- | --- |
| `src/config.ts` | Textos fijos: colegio, títulos, estado que se incluye, tamaño de hoja |
| `src/lib/excel.ts` | Lee los .xlsx (read-excel-file) |
| `src/lib/procesar.ts` | Reconoce cada archivo, agrupa por curso y arma las columnas del formato |
| `src/lib/pdf.ts` | Diseña cada hoja del PDF (pdfmake) y calcula la escala para que entre |
| `src/lib/pdf-navegador.ts` | Genera y descarga el PDF o el .zip en el navegador |
| `src/App.tsx` | La interfaz |
| `scripts/recortar-fuentes.py` | Regenera la fuente del PDF a partir de Carlito |

## Publicar gratis

`dist/index.html` es un sitio estático de un solo archivo: sirve cualquier hosting estático.

**GitHub Pages** (ya viene configurado en `.github/workflows/publicar.yml`):

1. Subir el proyecto a un repositorio de GitHub. Con una cuenta gratis el repositorio tiene que ser público
   (el código no tiene datos de alumnos; el `.gitignore` deja afuera los .xlsx y .pdf).
2. En el repositorio: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Hacer push a `main`. Queda publicado en `https://USUARIO.github.io/NOMBRE-DEL-REPO/`.

**Cloudflare Pages**: crear un proyecto conectado al repositorio (comando `npm run build`, carpeta `dist`),
o subir la carpeta `dist` a mano con la opción de carga directa. Permite repositorio privado.

## Fuente

El PDF usa Planilla Sans, un recorte de Carlito (misma medida que Calibri) bajo la SIL Open Font License.
Ver `src/assets/fuentes/OFL.txt`.
