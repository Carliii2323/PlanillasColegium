"""Genera las fuentes del PDF a partir de Carlito (SIL OFL 1.1).

Recorta Carlito a los caracteres latinos (español incluido) para que la página
pese poco, y renombra la familia a "Planilla Sans", porque la OFL pide no usar
el nombre original en versiones modificadas.

También genera src/lib/anchos-fuente.ts con el ancho de cada carácter, que se
usa para calcular el ancho de las columnas y que cada hoja entre en una página.

Uso:  pip install fonttools
      python scripts/recortar-fuentes.py /ruta/Carlito-Regular.ttf /ruta/Carlito-Bold.ttf
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = "U+0020-007E,U+00A0-00FF,U+0100-017F,U+2010-2027,U+2030-203A,U+20AC,U+2122"
RAIZ = Path(__file__).resolve().parent.parent
DESTINO_FUENTES = RAIZ / "src" / "assets" / "fuentes"
DESTINO_ANCHOS = RAIZ / "src" / "lib" / "anchos-fuente.ts"


def procesar(origen: str) -> tuple[str, TTFont]:
    fuente = TTFont(origen)
    estilo = "Bold" if "bold" in Path(origen).stem.lower() else "Regular"
    opciones = subset.Options()
    opciones.layout_features = ["kern", "liga"]
    opciones.hinting = False
    opciones.desubroutinize = True
    recortador = subset.Subsetter(opciones)
    recortador.populate(unicodes=subset.parse_unicodes(UNICODES))
    recortador.subset(fuente)

    nombres = {
        1: "Planilla Sans",
        3: f"Planilla Sans {estilo}; recorte de Carlito",
        4: f"Planilla Sans {estilo}",
        6: f"PlanillaSans-{estilo}",
        16: "Planilla Sans",
    }
    tabla = fuente["name"]
    for registro in list(tabla.names):
        if registro.nameID in nombres:
            tabla.setName(nombres[registro.nameID], registro.nameID,
                          registro.platformID, registro.platEncID, registro.langID)

    DESTINO_FUENTES.mkdir(parents=True, exist_ok=True)
    salida = DESTINO_FUENTES / f"PlanillaSans-{estilo}.ttf"
    fuente.save(salida)
    print(f"{salida.name}: {salida.stat().st_size // 1024} KB")
    return estilo, TTFont(salida)


def anchos(fuente: TTFont) -> tuple[str, list[int]]:
    """Ancho de avance de cada carácter, en milésimas de em."""
    upem = fuente["head"].unitsPerEm
    cmap, hmtx = fuente.getBestCmap(), fuente["hmtx"]
    caracteres = sorted(c for c in cmap if c >= 0x20)
    return "".join(map(chr, caracteres)), [round(hmtx[cmap[c]][0] * 1000 / upem) for c in caracteres]


def escribir_anchos(fuentes: dict[str, TTFont]) -> None:
    lineas = [
        "// Generado por scripts/recortar-fuentes.py: no editar a mano.",
        "// Ancho de cada carácter de Planilla Sans, en milésimas de em.",
    ]
    for estilo, fuente in sorted(fuentes.items()):
        texto, valores = anchos(fuente)
        lineas.append(f"export const CARACTERES_{estilo.upper()} = {json.dumps(texto, ensure_ascii=False)}")
        lineas.append(f"export const ANCHOS_{estilo.upper()} = [{','.join(map(str, valores))}]")

    regular = fuentes["Regular"]
    alto = (regular["hhea"].ascent - regular["hhea"].descent) / regular["head"].unitsPerEm
    lineas.append("/** Alto de una línea de texto, en em (ascendente - descendente). */")
    lineas.append(f"export const ALTO_LINEA = {round(alto, 4)}")
    DESTINO_ANCHOS.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"{DESTINO_ANCHOS.name} generado")


if __name__ == "__main__":
    escribir_anchos(dict(procesar(ruta) for ruta in sys.argv[1:]))
