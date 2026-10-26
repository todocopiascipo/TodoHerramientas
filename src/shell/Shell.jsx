import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { GROUPS, TOOLS, findToolByPath, searchTools } from './tools.js';

const THEME_KEY = 'todocopias-theme';
const RECENT_KEY = 'todocopias-recent-tools';

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => readStorage(THEME_KEY, 'auto'));
  useEffect(() => {
    applyTheme(theme);
    writeStorage(THEME_KEY, theme);
  }, [theme]);
  return [theme, setTheme];
}

export function useRecentTools(activeId) {
  const [recent, setRecent] = useState(() => readStorage(RECENT_KEY, []));
  useEffect(() => {
    if (!activeId) return;
    setRecent((current) => {
      const next = [activeId, ...current.filter((id) => id !== activeId)].slice(0, 4);
      writeStorage(RECENT_KEY, next);
      return next;
    });
  }, [activeId]);
  return recent.map((id) => TOOLS.find((tool) => tool.id === id)).filter(Boolean);
}

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);
  const navigate = useCallback((nextPath) => {
    if (nextPath !== window.location.pathname) window.history.pushState({}, '', nextPath);
    setPath(nextPath);
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  return [path, navigate];
}

function NavLink({ tool, active, onNavigate }) {
  return (
    <a href={tool.path} className={`nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined}
      onClick={(event) => { event.preventDefault(); onNavigate(tool.path); }}>
      <Icon name={tool.icon} />
      <span>{tool.title}</span>
    </a>
  );
}

const THEME_OPTIONS = [
  { value: 'auto', label: 'Automático', icon: 'auto' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' }
];

export function Sidebar({ activeId, onNavigate, open, onClose, theme, onThemeChange }) {
  return (
    <>
      <div className={`sidebar-backdrop ${open ? 'open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Menú de herramientas">
        <div className="sidebar-brand">
          <a href="/" className="brand" onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
            <span className="brand-mark">TC</span>
            <span>
              <strong>Todo Copias</strong>
              <small>Suite de herramientas</small>
            </span>
          </a>
          <button type="button" className="icon-button sidebar-close" onClick={onClose} aria-label="Cerrar menú">
            <Icon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav">
          <a href="/" className={`nav-link ${activeId === null ? 'active' : ''}`} aria-current={activeId === null ? 'page' : undefined}
            onClick={(event) => { event.preventDefault(); onNavigate('/'); }}>
            <Icon name="home" />
            <span>Inicio</span>
          </a>
          {GROUPS.map((group) => (
            <div className="nav-group" key={group.id}>
              <p className="nav-group-title">{group.title}</p>
              {TOOLS.filter((tool) => tool.group === group.id).map((tool) => (
                <NavLink key={tool.id} tool={tool} active={tool.id === activeId} onNavigate={onNavigate} />
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="theme-switch" role="radiogroup" aria-label="Tema de colores">
            {THEME_OPTIONS.map((option) => (
              <button key={option.value} type="button" role="radio" aria-checked={theme === option.value}
                title={option.label} aria-label={option.label} onClick={() => onThemeChange(option.value)}>
                <Icon name={option.icon} size={18} />
              </button>
            ))}
          </div>
          <p className="privacy-note"><Icon name="lock" size={14} /> Todo se procesa en tu navegador.</p>
        </div>
      </aside>
    </>
  );
}

export function ToolHeader({ tool, children }) {
  const group = GROUPS.find((item) => item.id === tool.group);
  return (
    <header className="tool-header">
      <div className="tool-header-main">
        <span className="tool-header-icon"><Icon name={tool.icon} size={24} /></span>
        <div>
          <p className="eyebrow">{group?.title}</p>
          <h1>{tool.title}</h1>
          <p className="tool-subtitle">{tool.subtitle}</p>
        </div>
      </div>
      {children && <div className="tool-header-actions">{children}</div>}
    </header>
  );
}

// Iframe que se adapta a la altura de su contenido (las apps son del mismo origen).
export function EmbeddedFrame({ tool }) {
  const frameRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [height, setHeight] = useState(900);

  useEffect(() => {
    setLoading(true);
    const frame = frameRef.current;
    if (!frame) return undefined;
    let observer;
    let interval;

    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const body = doc.body;
      const style = frame.contentWindow.getComputedStyle(body);
      const next = Math.ceil(body.scrollHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom));
      setHeight(Math.max(640, next));
    };

    const onLoad = () => {
      setLoading(false);
      if (tool.fixedHeight) return;
      try {
        measure();
        observer = new frame.contentWindow.ResizeObserver(measure);
        observer.observe(frame.contentDocument.body);
        // Las apps cambian de tamaño también al cargar imágenes o abrir paneles.
        interval = window.setInterval(measure, 1500);
      } catch {
        setHeight(1280);
      }
    };

    frame.addEventListener('load', onLoad);
    return () => {
      frame.removeEventListener('load', onLoad);
      observer?.disconnect();
      window.clearInterval(interval);
    };
  }, [tool.src, tool.fixedHeight]);

  return (
    <div className="frame-card">
      {loading && <div className="frame-loading">Cargando {tool.title}…</div>}
      <iframe ref={frameRef} title={tool.title} src={tool.src}
        className={tool.fixedHeight ? 'frame-fixed' : ''} style={tool.fixedHeight ? undefined : { height }} />
      <a className="frame-open" href={tool.src} target="_blank" rel="noreferrer">
        <Icon name="external" size={14} /> Abrir en una pestaña aparte
      </a>
    </div>
  );
}

function ToolCard({ tool, onNavigate }) {
  return (
    <a href={tool.path} className="tool-card" onClick={(event) => { event.preventDefault(); onNavigate(tool.path); }}>
      <span className="tool-card-icon"><Icon name={tool.icon} size={24} /></span>
      <span className="tool-card-body">
        <strong>{tool.title}</strong>
        <span>{tool.description}</span>
      </span>
      <Icon name="arrow" size={18} className="tool-card-arrow" />
    </a>
  );
}

export function HomePage({ onNavigate, recent }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const results = useMemo(() => searchTools(query), [query]);
  const searching = query.trim().length > 0;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <section className="home-page">
      <div className="home-hero">
        <h1>¿Qué querés hacer hoy?</h1>
        <p className="tool-subtitle">Elegí una herramienta o buscá por lo que necesitás: “anillado”, “numerar”, “foto carnet”…</p>
        <label className="search-box">
          <Icon name="search" />
          <input ref={inputRef} type="search" value={query} placeholder="Buscar herramienta"
            aria-label="Buscar herramienta" onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && results[0]) onNavigate(results[0].path);
              if (event.key === 'Escape') setQuery('');
            }} />
          <kbd>/</kbd>
        </label>
        {!searching && recent.length > 0 && (
          <div className="recent-row">
            <span>Recientes:</span>
            {recent.map((tool) => (
              <button key={tool.id} type="button" className="chip" onClick={() => onNavigate(tool.path)}>
                <Icon name={tool.icon} size={16} /> {tool.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {searching ? (
        <div className="home-group">
          <h2>{results.length ? `Resultados (${results.length})` : 'Sin resultados'}</h2>
          {results.length === 0 && <p className="tool-subtitle">No encontramos herramientas para “{query}”. Probá con otra palabra.</p>}
          <div className="tool-grid">
            {results.map((tool) => <ToolCard key={tool.id} tool={tool} onNavigate={onNavigate} />)}
          </div>
        </div>
      ) : GROUPS.map((group) => (
        <div className="home-group" key={group.id}>
          <h2>{group.title}</h2>
          <div className="tool-grid">
            {TOOLS.filter((tool) => tool.group === group.id).map((tool) => (
              <ToolCard key={tool.id} tool={tool} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function SuiteLayout({ renderTool }) {
  const [path, navigate] = useRoute();
  const [theme, setTheme] = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const tool = findToolByPath(path);
  const recent = useRecentTools(tool?.id);

  useEffect(() => {
    document.title = tool ? `${tool.title} | Todo Copias` : 'Todo Copias | Suite de herramientas';
  }, [tool]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const go = useCallback((nextPath) => {
    setMenuOpen(false);
    navigate(nextPath);
  }, [navigate]);

  return (
    <div className="suite">
      <Sidebar activeId={tool?.id ?? null} onNavigate={go} open={menuOpen} onClose={() => setMenuOpen(false)}
        theme={theme} onThemeChange={setTheme} />
      <div className="suite-main">
        <header className="mobile-bar">
          <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <strong>{tool ? tool.title : 'Todo Copias'}</strong>
        </header>
        <main className="suite-content">
          {tool ? (
            <div key={tool.id} className="tool-page">
              {renderTool(tool, go) || (
                <>
                  <ToolHeader tool={tool} />
                  <EmbeddedFrame tool={tool} />
                </>
              )}
            </div>
          ) : (
            <HomePage onNavigate={go} recent={recent} />
          )}
        </main>
      </div>
    </div>
  );
}
