import { request } from './request';
import { TOKEN_KEY } from '@zenith/shared';

const FLUSH_INTERVAL_MS = 30_000;
const MAX_BUFFER_SIZE = 50;
const SESSION_KEY = 'zenith_tracker_sid';

export interface TrackEvent {
  sessionId: string;
  eventType: 'page_view' | 'page_leave' | 'feature_use' | 'area_click';
  pagePath: string;
  pageTitle?: string;
  elementKey?: string;
  elementLabel?: string;
  componentArea?: string;
  clickX?: number;
  clickY?: number;
  durationMs?: number;
}

class Tracker {
  private readonly buffer: Omit<TrackEvent, 'sessionId'>[] = [];
  private readonly sessionId: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.setupAutoFlush();
    this.setupUnloadFlush();
  }

  private getOrCreateSessionId(): string {
    try {
      let id = sessionStorage.getItem(SESSION_KEY);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(SESSION_KEY, id);
      }
      return id;
    } catch {
      return crypto.randomUUID();
    }
  }

  track(event: Omit<TrackEvent, 'sessionId'>) {
    this.buffer.push(event);
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.flush();
    }
  }

  private setupAutoFlush() {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private setupUnloadFlush() {
    const handler = () => this.flushSync();
    document.addEventListener('pagehide', handler);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushSync();
    });
  }

  /** Async flush — used during normal operation */
  private flush() {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0).map((e) => ({ ...e, sessionId: this.sessionId }));
    request
      .post('/api/analytics/events', { events })
      .catch(() => {
        // Analytics errors must not break the app
      });
  }

  /** Sync flush via fetch keepalive — reliable even during page unload, supports auth header */
  private flushSync() {
    if (this.buffer.length === 0) return;
    const events = this.buffer.splice(0).map((e) => ({ ...e, sessionId: this.sessionId }));
    try {
      const body = JSON.stringify({ events });
      const apiBase = (import.meta.env.VITE_API_BASE_URL as string) || '/api';
      const token = localStorage.getItem(TOKEN_KEY);
      fetch(`${apiBase}/analytics/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body,
        keepalive: true,
      }).catch(() => { /* ignore — analytics must not break the app */ });
    } catch {
      // ignore
    }
  }

  destroy() {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }
}

// Module-level singleton — auto-initialises on first import
let _tracker: Tracker | null = null;

function getTracker(): Tracker {
  _tracker ??= new Tracker();
  return _tracker;
}

/** Track a page view (called on route enter) */
export function trackPageView(pagePath: string, pageTitle?: string) {
  getTracker().track({ eventType: 'page_view', pagePath, pageTitle });
}

/** Track a page leave (called on route exit, pass durationMs) */
export function trackPageLeave(pagePath: string, durationMs: number, pageTitle?: string) {
  getTracker().track({ eventType: 'page_leave', pagePath, durationMs, pageTitle });
}

/**
 * Track a feature interaction (button click, menu item, etc.)
 *
 * @param elementKey   Stable identifier, e.g. 'export-btn', 'create-btn'
 * @param elementLabel Human-readable label, e.g. '导出', '新增'
 * @param componentArea  UI zone, e.g. 'search-toolbar', 'table-actions', 'form'
 */
export function trackFeature(elementKey: string, elementLabel: string, componentArea?: string) {
  getTracker().track({
    eventType: 'feature_use',
    pagePath: globalThis.location.pathname,
    elementKey,
    elementLabel,
    componentArea,
  });
}

/**
 * Track a click within a component area (for heatmap).
 * Call this inside an onClick handler, passing the MouseEvent and
 * the ref of the target container element.
 *
 * @param e              React MouseEvent (or native MouseEvent)
 * @param containerEl    The bounding container element
 * @param componentArea  Area identifier, e.g. 'table', 'search-toolbar'
 */
export function trackAreaClick(
  e: { clientX: number; clientY: number },
  containerEl: HTMLElement,
  componentArea: string,
) {
  const rect = containerEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const clickX = Math.round(((e.clientX - rect.left) / rect.width) * 100 * 10) / 10;
  const clickY = Math.round(((e.clientY - rect.top) / rect.height) * 100 * 10) / 10;
  getTracker().track({
    eventType: 'area_click',
    pagePath: globalThis.location.pathname,
    componentArea,
    clickX: Math.max(0, Math.min(100, clickX)),
    clickY: Math.max(0, Math.min(100, clickY)),
  });
}
