/**
 * EverOS HTTP client — the memory layer that makes the second run cheap.
 *
 * EverOS runs as a local Python server (`everos server start`) on
 * 127.0.0.1:8000 and speaks JSON over /api/v2. It ships no authentication and
 * binds to loopback only, so there is nothing to sign here.
 *
 * Flow this app uses:
 *   run 1  → addMessages(trajectory) → flush()      // store what the agent did
 *   run 2  → searchAgentMemory(task)                // recall it, skip the work
 *
 * Schemas verified against EverOS docs/api.md (v2), 6 August 2026.
 */

const BASE_URL = process.env.EVEROS_BASE_URL ?? 'http://127.0.0.1:8000';
const API = `${BASE_URL}/api/v2`;

/** Every successful EverOS response is wrapped in this envelope. */
interface SuccessEnvelope<T> {
  request_id: string;
  data: T;
}

export interface MessageItem {
  sender_id: string;
  role: 'user' | 'assistant' | 'system';
  /** Unix epoch MILLISECONDS. The contract is ms, not seconds. */
  timestamp: number;
  content: string;
}

export interface Scope {
  app_id?: string;
  project_id?: string;
}

export class EverOSError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EverOSError';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new EverOSError(
      `Could not reach EverOS at ${BASE_URL}. Is the server running? ` +
        `Start it with: everos server start`,
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EverOSError(`EverOS ${path} returned ${res.status}: ${text}`, res.status);
  }

  const envelope = (await res.json()) as SuccessEnvelope<T>;
  return envelope.data;
}

/**
 * Append messages to a session buffer. The server accumulates them until its
 * boundary detector fires — which is why a run must call flush() at the end
 * rather than assuming /add persisted anything.
 */
export async function addMessages(
  sessionId: string,
  messages: MessageItem[],
  scope: Scope = {},
): Promise<{ message_count: number; status: 'accumulated' | 'extracted' }> {
  return post('/memory/add', {
    session_id: sessionId,
    app_id: scope.app_id ?? 'default',
    project_id: scope.project_id ?? 'default',
    messages,
  });
}

/**
 * Force extraction now. This runs an LLM call server-side and takes several
 * seconds — budget for it, and never call it inside a tight demo loop.
 * Markdown is durable when this returns; the search index is NOT yet in sync.
 */
export async function flush(
  sessionId: string,
  scope: Scope = {},
): Promise<{ status: 'extracted' | 'no_extraction' }> {
  return post('/memory/flush', {
    session_id: sessionId,
    app_id: scope.app_id ?? 'default',
    project_id: scope.project_id ?? 'default',
  });
}

export interface SearchOptions extends Scope {
  method?: 'hybrid' | 'bm25' | 'vector';
  top_k?: number;
  min_score?: number;
  /** Retries to absorb the documented LanceDB index lag. */
  retries?: number;
  retryDelayMs?: number;
}

/**
 * Search the AGENT memory track — cases and skills, i.e. what this agent has
 * previously done. Passing agent_id (not user_id) selects that track.
 *
 * IMPORTANT: /add and /flush write markdown synchronously, but the LanceDB
 * index rebuilds asynchronously. The docs put typical lag under a second and
 * worst case at 10-15 seconds. A search immediately after a flush can
 * therefore return nothing even though the memory exists — which would look
 * exactly like "the product doesn't work" on stage. So we retry with backoff
 * rather than trusting the first read.
 */
export async function searchAgentMemory(
  agentId: string,
  query: string,
  opts: SearchOptions = {},
): Promise<unknown> {
  const { retries = 4, retryDelayMs = 1500 } = opts;

  const body = {
    agent_id: agentId,
    app_id: opts.app_id ?? 'default',
    project_id: opts.project_id ?? 'default',
    query,
    method: opts.method ?? 'hybrid',
    top_k: opts.top_k ?? 5,
    ...(opts.min_score !== undefined ? { min_score: opts.min_score } : {}),
  };

  let lastEmpty: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const data = await post<unknown>('/memory/search', body);

    if (!isEmptyResult(data)) return data;

    lastEmpty = data;
    if (attempt < retries) {
      // Linear backoff: 1.5s, 3s, 4.5s, 6s — covers the documented worst case.
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  return lastEmpty;
}

/**
 * EverOS groups results by kind, so "empty" means every group is empty.
 * Written defensively because the exact grouping keys are not pinned in the
 * docs — treat any array we find as the signal.
 */
function isEmptyResult(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === 'object') {
    const arrays = Object.values(data as Record<string, unknown>).filter(Array.isArray);
    if (arrays.length === 0) return false; // shape we don't recognise — assume real
    return arrays.every((a) => (a as unknown[]).length === 0);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Liveness probe. Use before a demo run so failures surface early, not on stage. */
export async function isUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}
