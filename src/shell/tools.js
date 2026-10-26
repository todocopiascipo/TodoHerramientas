// Registro único de herramientas: alimenta el menú lateral, el Inicio, el buscador y el ruteo.

export const GROUPS = [
  { id: 'ventas', title: 'Ventas y compras' },
  { id: 'impresion', title: 'Impresión' },
  { id: 'rotulacion', title: 'Rotulación' }
];

export const TOOLS = [
  {
    id: 'presupuestos',
    path: '/presupuestos',
    group: 'ventas',
    icon: 'calculator',
    title: 'Presupuestos',
    subtitle: 'Fotocopias, impresiones, papeles especiales y anillados.',
    description: 'Calculá el precio de fotocopias, impresiones y anillados, y copiá el mensaje para el cliente.',
    keywords: 'precio cotizar fotocopia anillado descuento cliente',
    src: '/presupuestos.html'
  },
  {
    id: 'todopedidos',
    path: '/todopedidos',
    group: 'ventas',
    icon: 'cart',
    title: 'TodoPedidos',
    subtitle: 'Pedidos a proveedores con Excel opcional, precios estimados y listas guardadas.',
    description: 'Armá pedidos para proveedores, guardá listas y compará contra un Excel de precios.',
    keywords: 'proveedor compra lista excel stock',
    src: '/apps/todopedidos/index.html',
    // Tiene una barra fija abajo: se muestra con alto de pantalla y scroll propio.
    fixedHeight: true
  },
  {
    id: 'talonarios',
    path: '/talonarios',
    aliases: ['/presets-talonarios'],
    group: 'impresion',
    icon: 'receipt',
    title: 'Talonarios',
    subtitle: 'Numerá un PDF limpio con ORIGINAL/COPIA, prefijos y rangos. Incluye presets.',
    description: 'Numerá PDFs con ORIGINAL/COPIA, prefijos y rangos. Guardá presets para trabajos repetidos.',
    keywords: 'numerar numeracion original copia factura recibo preset pdf'
  },
  {
    id: 'tarjetas',
    path: '/tarjetas',
    group: 'impresion',
    icon: 'cards',
    title: 'Tarjetas',
    subtitle: 'Hojas A4 con 10 tarjetas de 90 × 50 mm, simple o doble faz.',
    description: 'Armá hojas A4 con 10 tarjetas de 90 × 50 mm, simple o doble faz, con demasía y marcas de corte.',
    keywords: 'tarjeta personal presentacion doble faz corte'
  },
  {
    id: 'autofigu',
    path: '/autofigu',
    group: 'impresion',
    icon: 'images',
    title: 'AutoFigu',
    subtitle: 'Figuritas, fotos carnet, personalizados y folletos A6/A5 en hoja A4.',
    description: 'Armá láminas A4 de figuritas, fotos carnet y folletos a partir de tus fotos.',
    keywords: 'figurita foto carnet folleto lamina a6 a5',
    src: '/apps/autofigu/index.html'
  },
  {
    id: 'inversor-bn-impresion',
    path: '/inversor-bn-impresion',
    group: 'impresion',
    icon: 'contrast',
    title: 'Inversor B/N',
    subtitle: 'Invertí archivos con fondo negro para ahorrar tóner al imprimir.',
    description: 'Invertí imágenes o PDF con fondo negro para imprimir más claro y ahorrar tóner.',
    keywords: 'invertir negro blanco toner pdf imagen',
    src: '/apps/inversor-bn-impresion/index.html'
  },
  {
    id: 'todoautos',
    path: '/todoautos',
    group: 'rotulacion',
    icon: 'car',
    title: 'TodoAutos',
    subtitle: 'Carteles A4 para vinilo rotulado con exportación SVG o PNG transparente (v1.1).',
    description: 'Generá carteles A4 para vinilo con encabezado calado y exportá en SVG o PNG.',
    keywords: 'cartel vinilo auto venta svg png rotulo',
    src: '/apps/todoautos/index.html'
  }
];

export function findToolByPath(path) {
  const clean = path.replace(/\/+$/, '') || '/';
  return TOOLS.find((tool) => tool.path === clean || tool.aliases?.includes(clean)) || null;
}

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function searchTools(query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return TOOLS;
  return TOOLS.filter((tool) => {
    const haystack = normalize(`${tool.title} ${tool.description} ${tool.keywords}`);
    return terms.every((term) => haystack.includes(term));
  });
}
