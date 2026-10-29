/**
 * A tiny message link between the page (buttons, sound, saving) and the world (the 3D garden,
 * which may run in a worker). Calls are queued and sent together at the end of the current
 * task, in order, as one message: the world's few dozen sound cues a frame cost one post.
 */
export interface Port {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
}

type Call = { m: string; a: unknown[]; id?: number } | { r: number; v: unknown };

export class Link {
  private queue: Call[] = [];
  private transfer: Transferable[] = [];
  private flushing = false;
  private nextId = 1;
  private readonly waiting = new Map<number, (v: unknown) => void>();

  constructor(
    private readonly port: Port,
    handlers: Record<string, (...a: never[]) => unknown> | null = null,
  ) {
    (port as Partial<MessagePort>).start?.call(port); // (a MessagePort only delivers once started)
    port.addEventListener('message', (e: MessageEvent) => {
      const calls = e.data as Call[];
      if (!Array.isArray(calls)) return;
      for (const c of calls) {
        if ('r' in c) {
          this.waiting.get(c.r)?.(c.v);
          this.waiting.delete(c.r);
          continue;
        }
        const f = handlers?.[c.m] as ((...a: unknown[]) => unknown) | undefined;
        if (!f) continue;
        const v = f(...c.a);
        if (c.id !== undefined) {
          const id = c.id;
          void Promise.resolve(v).then((value) => this.send({ r: id, v: value }));
        }
      }
    });
  }

  /** Call `m` on the other side (no answer). */
  call(m: string, ...a: unknown[]) {
    this.send({ m, a });
  }

  /** Call `m` on the other side and wait for its answer. */
  ask<T>(m: string, ...a: unknown[]): Promise<T> {
    const id = this.nextId++;
    this.send({ m, a, id });
    return new Promise<T>((resolve) => this.waiting.set(id, resolve as (v: unknown) => void));
  }

  /** Send now (with something to hand over, e.g. a canvas), ahead of nothing still queued. */
  post(m: string, a: unknown[], transfer: Transferable[]) {
    this.flush();
    this.port.postMessage([{ m, a }], transfer);
  }

  private send(c: Call, transfer: Transferable[] = []) {
    this.queue.push(c);
    this.transfer.push(...transfer);
    if (this.flushing) return;
    this.flushing = true;
    queueMicrotask(() => this.flush());
  }

  flush() {
    this.flushing = false;
    if (!this.queue.length) return;
    const q = this.queue;
    const t = this.transfer;
    this.queue = [];
    this.transfer = [];
    this.port.postMessage(q, t);
  }

  /** A stand-in object whose every method call (and property set) is sent across as `prefix.name`. */
  proxy<T extends object>(prefix: string): T {
    return new Proxy({} as T, {
      get: (_t, name) => (...a: unknown[]) => this.call(`${prefix}.${String(name)}`, ...a),
      set: (_t, name, value) => {
        this.call(`${prefix}=${String(name)}`, value);
        return true;
      },
    });
  }
}

/** Handlers for `proxy(prefix)` calls: forwards `prefix.method(...)` and `prefix=prop` to `target`. */
export function proxied(prefix: string, target: object): Record<string, (...a: never[]) => unknown> {
  const out: Record<string, (...a: never[]) => unknown> = {};
  let o: object | null = target;
  const names = new Set<string>();
  while (o && o !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(o)) names.add(n);
    o = Object.getPrototypeOf(o);
  }
  for (const n of names) {
    out[`${prefix}.${n}`] = (...a: never[]) => (target as Record<string, (...a: never[]) => unknown>)[n](...a);
    out[`${prefix}=${n}`] = ((v: unknown) => ((target as Record<string, unknown>)[n] = v)) as (...a: never[]) => unknown;
  }
  return out;
}
