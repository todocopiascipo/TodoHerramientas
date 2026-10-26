// Lógica pura de Talonarios (sin DOM): configuración, validación y presets.

export const MAX_PAGES = 5000;
export const SLOW_PAGES = 1500;
export const PRESET_FILE_TYPE = 'todocopias-talonarios-presets';

export const FIELDS = {
  badge: { label: 'ORIGINAL/COPIA', color: '#1e61a8' },
  number: { label: 'Numeración', color: '#312783' },
  number2: { label: 'Numeración 2', color: '#7c3aed' }
};

export const DEFAULT_CONFIG = {
  duplicate: true,
  fileName: 'pdf-numerado.pdf',
  numberPrefixText: 'N° ',
  numberPrefix: '10-',
  startNumber: 1000,
  endNumber: 1002,
  digits: 7,
  originalText: 'ORIGINAL',
  copyText: 'COPIA',
  badge: { x: 56, y: 780, size: 12, font: 'Helvetica', color: '#111827', align: 'left' },
  number: { x: 56, y: 742, size: 12, font: 'Helvetica', color: '#111827', align: 'left' },
  secondNumberEnabled: false,
  number2: { x: 420, y: 742, size: 12, font: 'Helvetica', color: '#111827', align: 'left' }
};

export function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

export function normalizeConfig(config) {
  const base = cloneConfig(DEFAULT_CONFIG);
  const incoming = cloneConfig(config || {});
  return {
    ...base,
    ...incoming,
    badge: { ...base.badge, ...(incoming.badge || {}) },
    number: { ...base.number, ...(incoming.number || {}) },
    number2: { ...base.number2, ...(incoming.number2 || {}) },
    secondNumberEnabled: Boolean(incoming.secondNumberEnabled)
  };
}

export function formatNumber(config, value) {
  const digits = Math.max(0, Math.min(20, Number(config.digits) || 0));
  return `${config.numberPrefixText}${config.numberPrefix}${String(value).padStart(digits, '0')}`;
}

export function safeFileName(name) {
  const trimmed = String(name || '').trim().replace(/[\\/:*?"<>|]+/g, '-') || 'pdf-numerado.pdf';
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
}

export function countPages(config) {
  const start = Number(config.startNumber);
  const end = Number(config.endNumber);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return 0;
  return (end - start + 1) * (config.duplicate ? 2 : 1);
}

export function activeFields(config) {
  return [
    ...(config.duplicate ? ['badge'] : []),
    'number',
    ...(config.secondNumberEnabled ? ['number2'] : [])
  ];
}

// Devuelve errores (bloquean la generación) y avisos, cada uno con el paso y el campo afectados.
export function validateConfig(config, { pageSize } = {}) {
  const errors = [];
  const warnings = [];
  const blank = (value) => value === '' || value === null || value === undefined;
  const start = blank(config.startNumber) ? NaN : Number(config.startNumber);
  const end = blank(config.endNumber) ? NaN : Number(config.endNumber);
  const digits = Number(config.digits);

  if (!Number.isInteger(start) || start < 0) {
    errors.push({ step: 2, field: 'startNumber', message: 'El número inicial debe ser un entero de 0 en adelante.' });
  }
  if (!Number.isInteger(end) || end < 0) {
    errors.push({ step: 2, field: 'endNumber', message: 'El número final debe ser un entero de 0 en adelante.' });
  } else if (Number.isInteger(start) && end < start) {
    errors.push({ step: 2, field: 'endNumber', message: 'El número final no puede ser menor que el inicial.' });
  }
  if (!Number.isInteger(digits) || digits < 0 || digits > 20) {
    errors.push({ step: 2, field: 'digits', message: 'Los dígitos deben estar entre 0 y 20.' });
  } else if (Number.isInteger(end) && digits > 0 && String(end).length > digits) {
    warnings.push({ step: 2, field: 'digits', message: `El número final tiene ${String(end).length} dígitos y configuraste ${digits}: no se van a completar con ceros.` });
  }
  if (config.duplicate && !String(config.originalText).trim()) {
    errors.push({ step: 2, field: 'originalText', message: 'Escribí el texto para el original.' });
  }
  if (config.duplicate && !String(config.copyText).trim()) {
    errors.push({ step: 2, field: 'copyText', message: 'Escribí el texto para la copia.' });
  }

  const pages = countPages(config);
  if (pages > MAX_PAGES) {
    errors.push({ step: 2, field: 'endNumber', message: `Son ${pages} páginas: el máximo por PDF es ${MAX_PAGES}. Dividilo en varios rangos.` });
  } else if (pages > SLOW_PAGES) {
    warnings.push({ step: 2, field: 'endNumber', message: `Son ${pages} páginas: la generación puede tardar un poco.` });
  }

  for (const field of activeFields(config)) {
    const item = config[field];
    const size = Number(item.size);
    if (!(size > 0) || size > 400) {
      errors.push({ step: 3, field: `${field}.size`, message: `${FIELDS[field].label}: el tamaño debe estar entre 1 y 400.` });
    }
    if (pageSize) {
      const x = Number(item.x);
      const y = Number(item.y);
      if (!(x >= 0 && x <= pageSize.width && y >= 0 && y <= pageSize.height)) {
        warnings.push({ step: 3, field: `${field}.x`, message: `${FIELDS[field].label} quedó fuera de la página.` });
      }
    }
  }

  if (!String(config.fileName || '').trim()) {
    errors.push({ step: 4, field: 'fileName', message: 'Escribí un nombre para el archivo.' });
  }

  return { errors, warnings, valid: errors.length === 0 };
}

export function mergePresets(current, incoming) {
  const byName = new Map(current.map((preset) => [preset.name, preset]));
  for (const preset of incoming) byName.set(preset.name, preset);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function exportPresets(presets) {
  return JSON.stringify({ type: PRESET_FILE_TYPE, version: 1, presets }, null, 2);
}

// Acepta el archivo exportado o una lista simple de presets; lanza un error claro si no sirve.
export function parsePresetFile(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const list = Array.isArray(data) ? data : data?.presets;
  if (!Array.isArray(list)) throw new Error('El archivo no contiene presets de talonarios.');
  const presets = list
    .filter((item) => item && typeof item.name === 'string' && item.name.trim() && item.config && typeof item.config === 'object')
    .map((item) => ({ name: item.name.trim(), config: normalizeConfig(item.config) }));
  if (!presets.length) throw new Error('El archivo no contiene presets válidos.');
  return presets;
}
