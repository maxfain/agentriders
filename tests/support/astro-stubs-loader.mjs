// Module hooks for the one Astro virtual import the middleware needs.
// `defineMiddleware` is an identity at runtime (it only carries types), so the
// stub hands the handler back unchanged — the test then calls what Astro
// would call.
const VIRTUAL = 'astro:middleware';
const URL_ = 'virtual:astro-middleware';

// Vite resolves `./lib/session` to the .ts file; Node does not, so a relative
// specifier without an extension that fails to resolve is retried with `.ts`.
const RELATIVE_NO_EXT = /^\.{1,2}\/[^?#]*$/;
const HAS_EXT = /\.[a-z0-9]+$/i;

export async function resolve(specifier, context, next) {
  if (specifier === VIRTUAL) return { url: URL_, shortCircuit: true };
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && RELATIVE_NO_EXT.test(specifier) && !HAS_EXT.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    throw err;
  }
}

export function load(url, context, next) {
  if (url === URL_) {
    return { format: 'module', source: 'export const defineMiddleware = (fn) => fn;', shortCircuit: true };
  }
  return next(url, context);
}
