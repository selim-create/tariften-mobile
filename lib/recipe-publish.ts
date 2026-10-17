/**
 * Network guards for public recipe publication.
 *
 * Timeouts reject even if the native fetch implementation never settles an
 * aborted request. A timeout after POST is an UNKNOWN outcome, not a failed
 * publication: the WordPress server may have committed the recipe.
 */
export class RequestDeadlineError extends Error {
  constructor() {
    super('İstek zaman aşımına uğradı.');
    this.name = 'RequestDeadlineError';
  }
}

export class RecipeCreateUnconfirmedError extends Error {
  constructor() {
    super('Yayımlama yanıtı alınamadı.');
    this.name = 'RecipeCreateUnconfirmedError';
  }
}

export async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  milliseconds: number,
): Promise<T> {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    throw new Error('Geçersiz istek zaman sınırı.');
  }
  const controller = new AbortController();
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const settle = (callback: (value: any) => void, value: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      // Mark complete first, so a synchronous abort rejection cannot win the
      // race and replace the informative RequestDeadlineError.
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      controller.abort();
      reject(new RequestDeadlineError());
    }, milliseconds);
    try {
      operation(controller.signal).then(
        result => settle(resolve, result),
        reason => settle(reject, reason),
      );
    } catch (reason) {
      settle(reject, reason);
    }
  });
}

export function isPublishResultUncertain(reason: unknown): boolean {
  return reason instanceof RequestDeadlineError || reason instanceof RecipeCreateUnconfirmedError;
}
