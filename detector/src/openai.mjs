import { DetectorError } from './errors.mjs';

const configurationError = () => new DetectorError('CONFIGURATION_ERROR', 'Invalid OpenAI configuration.');
const providerError = () => new DetectorError('PROVIDER_ERROR', 'OpenAI request failed.');
const timeoutError = () => new DetectorError('PROVIDER_TIMEOUT', 'OpenAI request timed out.');
const invalidResponse = () => new DetectorError('INVALID_RESPONSE', 'Invalid OpenAI response.');
class TransientFailure extends Error {}

/** Fixed-origin transport shared by extraction and embeddings. No provider data escapes in errors. */
export async function postOpenAI(path, body, options = {}) {
  if (!options || typeof options !== 'object') throw configurationError();
  const { apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000, maxRetries = 1 } = options;
  if (!['/responses', '/embeddings'].includes(path)
      || typeof apiKey !== 'string' || !apiKey.trim()
      || typeof fetchImpl !== 'function'
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000
      || !Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 1) throw configurationError();
  let serialized;
  try { serialized = JSON.stringify(body); } catch { throw configurationError(); }
  if (serialized === undefined) throw configurationError();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(timeoutError());
      }, timeoutMs);
    });
    const request = async () => {
      let response;
      try {
        response = await fetchImpl(`https://api.openai.com/v1${path}`, {
          method: 'POST', redirect: 'error',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: serialized, signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) throw timeoutError();
        throw new TransientFailure();
      }
      if (!response || typeof response.json !== 'function' || typeof response.ok !== 'boolean') throw invalidResponse();
      if (!response.ok) {
        // Never consume an error body, which may contain transcript text or provider diagnostics.
        try { void response.body?.cancel().catch(() => {}); } catch { /* best-effort release */ }
        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) throw new TransientFailure();
        throw providerError();
      }
      try { return await response.json(); } catch (error) {
        if (controller.signal.aborted) throw timeoutError();
        if (error instanceof TypeError) throw new TransientFailure();
        throw invalidResponse();
      }
    };
    try {
      // The deadline includes body consumption and also bounds transports ignoring abort.
      return await Promise.race([request(), deadline]);
    } catch (error) {
      if (!(error instanceof TransientFailure)) {
        if (error instanceof DetectorError) throw error;
        throw providerError();
      }
      if (attempt === maxRetries) throw providerError();
    } finally {
      clearTimeout(timer);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw providerError();
}
