import { ChangeEvent, DragEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  Copy,
  FileSpreadsheet,
  FolderOpen,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import * as XLSX from "xlsx";

type SupplierItem = {
  id: string;
  code: string;
  name: string;
  price: number | null;
  provider: string;
  raw: Record<string, unknown>;
};

type OrderItem = {
  id: string;
  typedName: string;
  displayName: string;
  supplierName?: string;
  code?: string;
  provider?: string;
  price: number | null;
  quantity: number;
  matchScore?: number;
};

type Toast = {
  message: string;
  tone: "ok" | "neutral";
};

type CellValue = unknown;

type SavedOrder = {
  id: string;
  title: string;
  items: OrderItem[];
  updatedAt: string;
};

type DraftOrder = {
  title: string;
  items: OrderItem[];
};

const draftStorageKey = "todopedidos:draft";
const savedOrdersStorageKey = "todopedidos:saved-orders";

const sampleItems: OrderItem[] = [
  {
    id: crypto.randomUUID(),
    typedName: "Harina 000 x 25kg",
    displayName: "Harina 000 x 25kg",
    price: null,
    quantity: 1,
  },
  {
    id: crypto.randomUUID(),
    typedName: "Aceite girasol 5L",
    displayName: "Aceite girasol 5L",
    price: null,
    quantity: 2,
  },
];

function safeReadJson<T>(key: string, fallback: T): T {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? (JSON.parse(rawValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getInitialDraft(): DraftOrder {
  if (typeof window === "undefined") {
    return { title: "Pedido de hoy", items: sampleItems };
  }

  return safeReadJson<DraftOrder>(draftStorageKey, { title: "Pedido de hoy", items: sampleItems });
}

function getInitialSavedOrders() {
  if (typeof window === "undefined") {
    return [];
  }

  return safeReadJson<SavedOrder[]>(savedOrdersStorageKey, []);
}

const productColumnHints = [
  "detalle",
  "producto",
  "descripcion",
  "descripción",
  "detalle",
  "articulo",
  "artículo",
  "nombre",
  "item",
];

const priceColumnHints = [
  "precio1",
  "precio",
  "unitario",
  "lista",
  "importe",
  "valor",
  "neto",
  "final",
  "$",
];

const codeColumnHints = ["codigo", "código", "cod", "sku", "barra"];
const providerColumnHints = ["nomprovee", "proveedor", "artiprove"];

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreMatch(query: string, candidate: string) {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return 0;
  }

  let score = 0;
  if (normalizedCandidate.includes(normalizedQuery)) {
    score += 60;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    score += 20;
  }

  const queryTokens = tokenize(query);
  const candidateTokens = tokenize(candidate);
  const candidateTokenSet = new Set(candidateTokens);
  const tokenHits = queryTokens.filter((token) =>
    candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken)),
  ).length;

  score += queryTokens.length ? (tokenHits / queryTokens.length) * 45 : 0;

  const numericQuery = queryTokens.filter((token) => /\d/.test(token));
  const numericHits = numericQuery.filter((token) => candidateTokenSet.has(token)).length;
  score += numericQuery.length ? (numericHits / numericQuery.length) * 25 : 0;

  const lengthPenalty = Math.min(18, Math.abs(normalizedCandidate.length - normalizedQuery.length) / 5);
  return Math.max(0, Math.round(score - lengthPenalty));
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "Sin precio";
  }

  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatSavedDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function findColumn(headers: string[], hints: string[]) {
  const normalizedHeaders = headers.map((header) => normalizeText(header));
  const exactIndex = normalizedHeaders.findIndex((header) => hints.some((hint) => header === normalizeText(hint)));
  if (exactIndex >= 0) {
    return headers[exactIndex];
  }

  const index = normalizedHeaders.findIndex((header) => hints.some((hint) => header.includes(normalizeText(hint))));
  return index >= 0 ? headers[index] : null;
}

function buildSupplierItems(rows: Record<string, unknown>[]) {
  if (!rows.length) {
    return [];
  }

  const headers = Object.keys(rows[0]);
  const productColumn = findColumn(headers, productColumnHints) ?? headers[0];
  const priceColumn = findColumn(headers, priceColumnHints);
  const codeColumn = findColumn(headers, codeColumnHints);
  const providerColumn = findColumn(headers, providerColumnHints);

  return rows
    .map((row, index) => {
      const name = String(row[productColumn] ?? "").trim();
      const code = codeColumn ? String(row[codeColumn] ?? "").trim() : "";
      const provider = providerColumn ? String(row[providerColumn] ?? "").trim() : "";
      const detectedPrice = priceColumn ? parsePrice(row[priceColumn]) : null;
      const fallbackPrice = detectedPrice ?? Object.values(row).map(parsePrice).find((price) => price !== null) ?? null;

      return {
        id: `${index}-${code || name}`,
        code,
        name,
        price: fallbackPrice,
        provider,
        raw: row,
      };
    })
    .filter((item) => item.name.length > 1);
}

function rowsToRecords(rows: CellValue[][]) {
  const [headerRow, ...dataRows] = rows;
  if (!headerRow) {
    return [];
  }

  const headers = headerRow.map((header, index) => String(header || `Columna ${index + 1}`).trim());
  return dataRows.map((row) =>
    headers.reduce<Record<string, unknown>>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  );
}

function parseCsv(text: string) {
  const rows: CellValue[][] = [];
  let current = "";
  let row: CellValue[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some((cell) => String(cell).length > 0)) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some((cell) => String(cell).length > 0)) {
    rows.push(row);
  }

  return rowsToRecords(rows);
}

function parseLegacyExcel(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: true,
  });
}

function App() {
  const initialDraft = useMemo(() => getInitialDraft(), []);
  const [supplierItems, setSupplierItems] = useState<SupplierItem[]>([]);
  const [orderTitle, setOrderTitle] = useState(initialDraft.title);
  const [orderItems, setOrderItems] = useState<OrderItem[]>(initialDraft.items);
  const [savedOrders, setSavedOrders] = useState<SavedOrder[]>(() => getInitialSavedOrders());
  const [inputValue, setInputValue] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedSuggestion, setSelectedSuggestion] = useState<SupplierItem | null>(null);
  const [excelName, setExcelName] = useState("");
  const [toast, setToast] = useState<Toast | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      draftStorageKey,
      JSON.stringify({
        title: orderTitle,
        items: orderItems,
      }),
    );
  }, [orderItems, orderTitle]);

  useEffect(() => {
    window.localStorage.setItem(savedOrdersStorageKey, JSON.stringify(savedOrders));
  }, [savedOrders]);

  const suggestions = useMemo(() => {
    if (!supplierItems.length || inputValue.trim().length < 2) {
      return [];
    }

    return supplierItems
      .map((item) => ({ item, score: scoreMatch(inputValue, `${item.name} ${item.code}`) }))
      .filter(({ score }) => score >= 18)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }, [inputValue, supplierItems]);

  const activeMatch = selectedSuggestion ?? suggestions[0]?.item ?? null;
  const expectedPrice = activeMatch?.price ?? null;
  const total = orderItems.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0);
  const pricedItems = orderItems.filter((item) => item.price !== null).length;

  const showToast = (message: string, tone: Toast["tone"] = "ok") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 1800);
  };

  const copyText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text);
    showToast(message);
  };

  const saveCurrentOrder = () => {
    const cleanTitle = orderTitle.trim() || "Pedido sin titulo";
    const now = new Date().toISOString();

    setSavedOrders((orders) => {
      const existingOrder = orders.find((order) => normalizeText(order.title) === normalizeText(cleanTitle));
      const nextOrder: SavedOrder = {
        id: existingOrder?.id ?? crypto.randomUUID(),
        title: cleanTitle,
        items: orderItems,
        updatedAt: now,
      };

      return [nextOrder, ...orders.filter((order) => order.id !== nextOrder.id)];
    });
    setOrderTitle(cleanTitle);
    showToast("Lista guardada");
  };

  const loadSavedOrder = (order: SavedOrder) => {
    setOrderTitle(order.title);
    setOrderItems(order.items);
    showToast("Lista cargada", "neutral");
  };

  const deleteSavedOrder = (id: string) => {
    setSavedOrders((orders) => orders.filter((order) => order.id !== id));
    showToast("Lista borrada", "neutral");
  };

  const startNewOrder = () => {
    setOrderTitle("Pedido de hoy");
    setOrderItems([]);
    showToast("Nuevo pedido listo", "neutral");
  };

  const orderText = useMemo(() => {
    const lines = orderItems.map((item) => {
      const codeText = item.code ? ` [${item.code}]` : "";
      const priceText = item.price !== null ? ` - ${formatCurrency(item.price)} c/u` : "";
      return `- ${item.quantity} x ${item.displayName}${codeText}${priceText}`;
    });

    const totalText = pricedItems ? [``, `Total estimado: ${formatCurrency(total)}`] : [];
    return [`Hola, te paso ${orderTitle}:`, ...lines, ...totalText].join("\n");
  }, [orderItems, orderTitle, pricedItems, total]);

  const addItem = (forceColloquial = false) => {
    const typedName = inputValue.trim();
    if (!typedName) {
      return;
    }

    const chosenMatch = forceColloquial ? null : selectedSuggestion ?? suggestions[0]?.item ?? null;
    const matchScore = chosenMatch ? scoreMatch(typedName, chosenMatch.name) : undefined;
    const shouldUseMatch = chosenMatch && matchScore && matchScore >= 28;

    setOrderItems((items) => [
      {
        id: crypto.randomUUID(),
        typedName,
        displayName: shouldUseMatch ? chosenMatch.name : typedName,
        supplierName: shouldUseMatch ? chosenMatch.name : undefined,
        code: shouldUseMatch ? chosenMatch.code : undefined,
        provider: shouldUseMatch ? chosenMatch.provider : undefined,
        price: shouldUseMatch ? chosenMatch.price : null,
        quantity,
        matchScore,
      },
      ...items,
    ]);
    setInputValue("");
    setQuantity(1);
    setSelectedSuggestion(null);
  };

  const removeItem = (id: string) => {
    setOrderItems((items) => items.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, nextQuantity: number) => {
    setOrderItems((items) =>
      items.map((item) => (item.id === id ? { ...item, quantity: Math.max(1, nextQuantity || 1) } : item)),
    );
  };

  const useColloquialName = () => {
    addItem(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addItem();
    }
  };

  const readExcel = async (file: File) => {
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith(".csv");
    const isLegacyExcel = fileName.endsWith(".xls");
    const rows = isCsv
      ? parseCsv(await file.text())
      : isLegacyExcel
        ? parseLegacyExcel(await file.arrayBuffer())
        : rowsToRecords(await readSheet(file));

    const parsedItems = buildSupplierItems(rows);
    setSupplierItems(parsedItems);
    setExcelName(file.name);
    showToast(`${parsedItems.length} productos disponibles para buscar`, "neutral");
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await readExcel(file);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      await readExcel(file);
    }
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">TodoPedidos</p>
            <h1>Armá el pedido para tu proveedor</h1>
          </div>
          <div className="actions">
            <button className="ghost-button save-button" onClick={saveCurrentOrder}>
              <Save size={18} />
              Guardar
            </button>
            <button className="ghost-button" onClick={() => copyText(orderText, "Pedido completo copiado")}>
              <Clipboard size={18} />
              Copiar lista
            </button>
            <button className="icon-button" onClick={startNewOrder} aria-label="Nuevo pedido">
              <Plus size={18} />
            </button>
            <button className="icon-button" onClick={() => setOrderItems([])} aria-label="Vaciar pedido">
              <X size={18} />
            </button>
          </div>
        </header>

        <section className="title-panel" aria-label="Titulo del pedido">
          <label htmlFor="order-title">Titulo de la lista</label>
          <input
            id="order-title"
            value={orderTitle}
            onChange={(event) => setOrderTitle(event.target.value)}
            placeholder="Ej: Pedido lunes, Reposicion bebidas, Libreria agosto"
          />
          <span>Se guarda solo como borrador</span>
        </section>

        <section className="summary-strip" aria-label="Resumen del pedido">
          <div>
            <span>Items</span>
            <strong>{orderItems.length}</strong>
          </div>
          <div>
            <span>Con precio</span>
            <strong>{pricedItems}</strong>
          </div>
          <div>
            <span>Total esperado</span>
            <strong>{pricedItems ? formatCurrency(total) : "Sin Excel"}</strong>
          </div>
        </section>

        <section className="saved-panel" aria-label="Listas guardadas">
          <div className="saved-panel-head">
            <div>
              <span>Listas guardadas</span>
              <strong>{savedOrders.length ? `${savedOrders.length} disponibles` : "Todavia no hay listas"}</strong>
            </div>
            <button className="soft-command" onClick={saveCurrentOrder}>
              <Save size={17} />
              Guardar actual
            </button>
          </div>
          {savedOrders.length > 0 && (
            <div className="saved-list">
              {savedOrders.map((order) => (
                <article className="saved-order" key={order.id}>
                  <div>
                    <h2>{order.title}</h2>
                    <p>
                      {order.items.length} items
                      <span>{formatSavedDate(order.updatedAt)}</span>
                    </p>
                  </div>
                  <div className="saved-actions">
                    <button className="icon-button soft" onClick={() => loadSavedOrder(order)} aria-label={`Abrir ${order.title}`}>
                      <FolderOpen size={17} />
                    </button>
                    <button className="icon-button danger" onClick={() => deleteSavedOrder(order.id)} aria-label={`Borrar ${order.title}`}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="excel-panel">
          <button
            className={`upload-zone ${isDragging ? "dragging" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud size={22} />
            <span>Subir Excel para buscar coincidencias</span>
            <small>{excelName || "Opcional: .xlsx, .xls o .csv del proveedor"}</small>
          </button>
          <input
            ref={fileInputRef}
            className="hidden-input"
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={handleFileChange}
          />
          <div className="excel-status">
            <FileSpreadsheet size={18} />
            {supplierItems.length ? `${supplierItems.length} productos cargados` : "Podés pedir sin Excel"}
          </div>
        </section>

        <section className="order-list" aria-label="Lista de pedido">
          {orderItems.length === 0 ? (
            <div className="empty-state">
              <Sparkles size={22} />
              <p>Tu pedido está vacío. Escribí abajo y sumá productos con Enter.</p>
            </div>
          ) : (
            orderItems.map((item) => (
              <article className="order-item" key={item.id}>
                <div className="quantity-control">
                  <label htmlFor={`qty-${item.id}`}>Cant.</label>
                  <input
                    id={`qty-${item.id}`}
                    min="1"
                    type="number"
                    value={item.quantity}
                    onChange={(event) => updateQuantity(item.id, Number(event.target.value))}
                  />
                </div>
                <div className="item-copy">
                  <h2>{item.displayName}</h2>
                  <p>
                    {item.supplierName ? `Coincidencia: ${item.matchScore ?? 0}%` : "Nombre coloquial"}
                    {item.code && <span>Codigo {item.code}</span>}
                    <span>{item.price !== null ? `${formatCurrency(item.price)} c/u` : "Sin precio esperado"}</span>
                  </p>
                </div>
                <strong className="line-total">
                  {item.price !== null ? formatCurrency(item.price * item.quantity) : "A confirmar"}
                </strong>
                <div className="item-actions">
                  <button
                    className="icon-button soft"
                    onClick={() =>
                      copyText(`${item.quantity} x ${item.displayName}${item.code ? ` [${item.code}]` : ""}`, "Item copiado")
                    }
                    aria-label={`Copiar ${item.displayName}`}
                  >
                    <Copy size={17} />
                  </button>
                  <button
                    className="icon-button danger"
                    onClick={() => removeItem(item.id)}
                    aria-label={`Eliminar ${item.displayName}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>
      </section>

      <section className="composer" aria-label="Agregar item">
        <div className="suggestion-panel">
          <div className="expected-price">
            <Search size={18} />
            <div>
              <span>Precio esperado antes de agregar</span>
              <strong>{expectedPrice !== null ? formatCurrency(expectedPrice) : "Sin coincidencia seleccionada"}</strong>
            </div>
          </div>
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map(({ item, score }) => (
                <button
                  className={selectedSuggestion?.id === item.id ? "selected" : ""}
                  key={item.id}
                  onClick={() => setSelectedSuggestion(item)}
                >
                  <span>{item.name}</span>
                  <strong>{formatCurrency(item.price)}</strong>
                  <small>{item.code || `${score}%`}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="input-bubble">
          <input
            aria-label="Producto a agregar"
            value={inputValue}
            onChange={(event) => {
              setInputValue(event.target.value);
              setSelectedSuggestion(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribí algo como: coca 2.25, harina 000, queso barra..."
          />
          <div className="composer-controls">
            <input
              aria-label="Cantidad"
              min="1"
              type="number"
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
            <button className="secondary-add" onClick={useColloquialName}>
              <Plus size={17} />
              Usar escrito
            </button>
            <button className="primary-add" onClick={() => addItem()}>
              <Check size={18} />
              Agregar
            </button>
          </div>
        </div>
      </section>

      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </main>
  );
}

export default App;
