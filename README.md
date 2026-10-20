# Todo Copias - Suite fusionada

Web app local con ocho herramientas integradas:

- Presupuestos: calculadora para fotocopias, impresiones, papeles especiales y anillados.
- Talonarios: numerador PDF ORIGINAL/COPIA para plantillas limpias.
- Presets de talonarios: configuraciones reutilizables para trabajos frecuentes.
- AutoFigu: generador de laminas A4 para figuritas, fotos carnet y folletos. Incluye rotacion de imagen, cantidad automatica en personalizado y opcion para ocultar marcas de corte.
- TARJETAS: matriz A4 de 10 tarjetas de 90 x 50 mm, simple o doble faz, con diseños de 95 x 55 mm, vista previa y marcas de corte solo en el frente.
- Inversor B/N Impresion: herramienta para invertir blanco y negro antes de imprimir.
- TodoPedidos: armado de pedidos para proveedores con Excel opcional, precios estimados y listas guardadas.
- TodoAutos V 1.1: generador de carteles A4 para vinilo rotulado con exportacion SVG/PNG transparente. El PNG exporta A4 a 150 DPI con metadata fisica para reducir peso.

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

## TARJETAS

Abrir **TARJETAS** desde Inicio o la barra superior, o entrar a `/tarjetas`.

1. Elegir **Simple** o **Doble faz**.
2. Agregar uno o varios frentes (JPG, PNG, WebP o PDF) y ajustar la cantidad de cada diseño. Por defecto, cada diseño ocupa una hoja de 10 copias. Las cantidades se distribuyen en orden y continúan en hojas nuevas.
3. Seleccionar un diseño para ajustar su rotación, encuadre, zoom y posición. En un PDF se puede elegir la página; el contenido vectorial se conserva en la salida.
4. En doble faz, asignar un dorso a cada diseño. Se puede cargar otro archivo o usar la página 2 del PDF del frente. Elegir giro por borde largo o corto, igual que en el controlador de impresión.
5. Revisar frente y dorso, y descargar el PDF.

La hoja es A4 vertical (210 x 297 mm): dos columnas por cinco filas. El área completa de cada diseño mide 95 x 55 mm y tiene 2,5 mm de demasía por lado para un corte final de **90 x 50 mm**. La matriz comienza a 10 mm del borde izquierdo y 11 mm del borde superior, como en la plantilla de Illustrator. Las marcas se colocan en la demasía y terminan en el corte; tienen un trazo negro de 0,25 pt sobre una base blanca de 0,65 pt.

Las guías de diseño/corte, los números y la selección son solo de pantalla. El PDF incluye las marcas únicamente en el frente (también se pueden desactivar). En doble faz, las páginas se alternan: frente 1, dorso 1, frente 2, dorso 2. Los dorsos se reordenan para coincidir con los frentes, también en hojas incompletas. Para borde corto se giran además 180 grados.

**Imprimir SIN BORDES, ESCALA 100% REAL, en papel A4.** Desactivar “Ajustar a página” y la ampliación automática del modo sin bordes. El PDF solicita tamaño real y el giro elegido, pero el controlador puede reemplazar esas preferencias. Probar una hoja para verificar el registro mecánico de frente y dorso.

Los diseños que no tengan la proporción 95:55 se recortan para llenar por defecto; “Ajustar diseño completo” conserva todo el contenido y puede dejar blanco. Se admite un máximo de 1.000 tarjetas por PDF, 100 diseños y 50 MB por archivo. Las imágenes se procesan en su resolución original, hasta 40 megapíxeles.

### Verificación

```powershell
npm test
npm run build
```

Las pruebas comprueban medidas, demasía, paginado, alineación doble faz, PDF A4, marcas solo en frente, preferencias de impresión y PDFs de entrada rotados.

## Apps fusionadas

Las aplicaciones agregadas quedaron copiadas dentro de:

```text
public/apps/autofigu
public/apps/inversor-bn-impresion
public/apps/todopedidos
public/apps/todoautos
```

Las carpetas originales usadas como fuente no fueron modificadas.
