# Todo Copias - Suite fusionada

Web app local con siete herramientas integradas:

- Presupuestos: calculadora para fotocopias, impresiones, papeles especiales y anillados.
- Talonarios: numerador PDF ORIGINAL/COPIA para plantillas limpias.
- Presets de talonarios: configuraciones reutilizables para trabajos frecuentes.
- AutoFigu: generador de laminas A4 para figuritas, fotos carnet y folletos.
- Inversor B/N Impresion: herramienta para invertir blanco y negro antes de imprimir.
- TodoPedidos: armado de pedidos para proveedores con Excel opcional, precios estimados y listas guardadas.
- TodoAutos: generador de carteles A4 para vinilo rotulado con exportacion SVG/PNG transparente.

## Requisitos

- Node.js 20.19 o superior.
- Chrome o Edge.

## Instalacion y uso

```powershell
npm install
npm run dev
```

Luego abrir la URL local que muestre Vite, normalmente:

```text
http://127.0.0.1:5173
```

## Flujo

1. Elegir una herramienta desde Inicio o desde la barra superior.
2. En Talonarios, cargar un PDF limpio sin numeracion ni textos ORIGINAL/COPIA.
3. Ubicar visualmente los marcadores de ORIGINAL/COPIA y numeracion sobre la primera pagina.
4. Ajustar textos, rango, digitos, fuentes, colores y alineacion.
5. Usar "Vista previa rapida" para validar una muestra.
6. Usar "Generar PDF final" para descargar el PDF terminado.

Todo se procesa en el navegador. La app no sube archivos a internet ni requiere backend.

## Apps fusionadas

Las aplicaciones agregadas quedaron copiadas dentro de:

```text
public/apps/autofigu
public/apps/inversor-bn-impresion
public/apps/todopedidos
public/apps/todoautos
```

Las carpetas originales usadas como fuente no fueron modificadas.
