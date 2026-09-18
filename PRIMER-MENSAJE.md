# Primer mensaje para Claude Code

Copia esto tal cual en la primera sesión, después de haber puesto los tres
archivos en una carpeta y de haber ejecutado `git init && git add -A && git commit`.

---

Lee CLAUDE.md antes de tocar nada. Es un proyecto de un solo archivo,
`lector-bilingue.html`, sin build ni dependencias salvo pdf.js por CDN.

Contexto: muestra un PDF en inglés a la izquierda y la misma página con el texto
traducido dibujado en la posición original a la derecha. Viene de una serie larga
de iteraciones sobre casos reales; la sección "Invariantes" de CLAUDE.md lista
regresiones que ya se sufrieron una vez y no deben repetirse.

Antes de empezar:
1. Levanta el servidor con ./servir.sh y confirma que la app carga.
2. Pon algún PDF en ./pdfs/ para probar (ver la tabla de corpus en CLAUDE.md).

Reglas de trabajo que quiero mantener:
- Un cambio a la vez, y me dices qué página del corpus debo mirar para validarlo.
- Comentarios en castellano, explicando el *porqué* de cada heurística, no el qué.
- Nada de localStorage. Nada de frameworks. El archivo sigue siendo uno solo.
- Después de cada edición, verifica la sintaxis:
  `python3 -c "import re;h=open('lector-bilingue.html').read();open('/tmp/c.js','w').write(re.findall(r'<script>(.*?)</script>',h,re.S)[-1])" && node --check /tmp/c.js`

Primera tarea: el pendiente nº 1 de CLAUDE.md. Añade un modo de depuración
(parámetro ?debug=1 en la URL) que vuelque por consola, para la página actual,
el número de items de texto, de líneas, de bloques, cuántos quedan como skip y
por qué motivo. Necesito saber por qué hay páginas que no arrojan ningún bloque.
