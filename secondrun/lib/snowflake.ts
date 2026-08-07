/**
 * Snowflake connection for the corpus the agent searches.
 *
 * There is no model in this file and it produces no numbers that reach the
 * demo. It moves rows. The scoring arithmetic lives in the SQL in corpus.ts and
 * is verified against the local implementation by
 * scripts/verify-corpus-parity.mjs before any run is recorded.
 *
 * Credentials come from .env.local (gitignored) and are never logged.
 */

import snowflake from 'snowflake-sdk';

// The SDK logs connection chatter to stdout at INFO by default, which would
// interleave with the agent's own trace during a run.
snowflake.configure({ logLevel: 'ERROR' });

export interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  warehouse: string;
  database: string;
  schema: string;
}

/** Read config from the environment. Returns null when not configured. */
export function snowflakeConfig(): SnowflakeConfig | null {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USER;
  const password = process.env.SNOWFLAKE_PASSWORD;
  if (!account || !username || !password) return null;

  return {
    account,
    username,
    password,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE ?? 'COMPUTE_WH',
    database: process.env.SNOWFLAKE_DATABASE ?? 'DEJA',
    schema: process.env.SNOWFLAKE_SCHEMA ?? 'PUBLIC',
  };
}

export function isSnowflakeConfigured(): boolean {
  return snowflakeConfig() !== null;
}

export class SnowflakeError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'SnowflakeError';
    this.cause = cause;
  }
}

type Conn = ReturnType<typeof snowflake.createConnection>;

// One connection per process. Connecting costs ~1-2s, and the agent issues up
// to twelve queries in a run; paying that once matters on a stage.
let pending: Promise<Conn> | null = null;

function connect(): Promise<Conn> {
  if (pending) return pending;

  const cfg = snowflakeConfig();
  if (!cfg) {
    return Promise.reject(
      new SnowflakeError(
        'Snowflake is not configured. Set SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER and ' +
          'SNOWFLAKE_PASSWORD in .env.local, or set CORPUS_SOURCE=local to use ' +
          'the committed files.',
      ),
    );
  }

  pending = new Promise<Conn>((resolve, reject) => {
    const conn = snowflake.createConnection({
      account: cfg.account,
      username: cfg.username,
      password: cfg.password,
      warehouse: cfg.warehouse,
      database: cfg.database,
      schema: cfg.schema,
      // Venue wifi. Fail fast enough to fall back rather than hang the demo.
      timeout: 20000,
    });

    conn.connect((err) => {
      if (err) {
        // Let the next call retry rather than caching a dead connection.
        pending = null;
        reject(new SnowflakeError(`Snowflake connection failed: ${err.message}`, err));
        return;
      }
      resolve(conn);
    });
  });

  return pending;
}

/** Run one statement. Binds are passed through the driver, never interpolated. */
export async function query<T = Record<string, unknown>>(
  sqlText: string,
  binds: (string | number)[] = [],
): Promise<T[]> {
  const conn = await connect();

  return new Promise<T[]>((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) {
          reject(new SnowflakeError(`Query failed: ${err.message}`, err));
          return;
        }
        resolve((rows ?? []) as T[]);
      },
    });
  });
}

/** Close the pooled connection. Used by scripts so the process can exit. */
export async function closeSnowflake(): Promise<void> {
  if (!pending) return;
  const conn = await pending.catch(() => null);
  pending = null;
  if (!conn) return;
  await new Promise<void>((resolve) => conn.destroy(() => resolve()));
}
