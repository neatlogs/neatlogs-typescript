/**
 * Neatlogs trace doctor — manual-fix snippets for `--emit-fix`.
 *
 * PR #21 (§4.16.C). Each entry is a `(description, before, after)` triple
 * the user can copy-paste. We intentionally do NOT do AST-based auto-fix:
 * rewrites are fragile across project structures (Jupyter, K8s init,
 * generated code). The user copy-pastes the snippet — correct-by-construction.
 *
 * §12.8.3: snippet source is plain text with newlines; the renderer joins
 * with `\n` and the CLI writes the result to stdout verbatim. Do NOT
 * JSON-encode the snippet.
 */

/** A registered manual-fix snippet. */
export interface FixSnippet {
  description: string;
  before: string;
  after: string;
}

/**
 * The 4 registered snippets. Codes are stable identifiers matching the
 * `DoctorFinding.code` of the issue they fix.
 */
export const FIX_SNIPPETS: Readonly<Record<string, FixSnippet>> = {
  'init-after-client': {
    description:
      'Move neatlogs.init() to the top of the entry point (before any LLM client is constructed).',
    before:
      'from openai import OpenAI\n' +
      'import neatlogs\n' +
      "neatlogs.init(api_key=os.environ['NEATLOGS_API_KEY'])\n",
    after:
      'import neatlogs\n' +
      "neatlogs.init(api_key=os.environ['NEATLOGS_API_KEY'])\n" +
      'from openai import OpenAI\n',
  },
  'missing-span-kind': {
    description:
      "Set neatlogs.span.kind on every emitted span, either via the @neatlogs.span decorator or the wrapper.",
    before: 'from neatlogs import trace\n\n@trace\ndef my_function():\n    ...\n',
    after:
      "from neatlogs import trace\n\n@trace(kind='TOOL')\ndef my_function():\n    ...\n",
  },
  'zero-duration-span': {
    description:
      "The wrapper exited the span before calling .end() — fix the exception path.",
    before:
      'def patched(*args, **kwargs):\n' +
      "    span = tracer.start_span('my_op')\n" +
      '    response = orig(*args, **kwargs)\n' +
      '    return response  # bug: span.end() never called on the error path\n',
    after:
      'def patched(*args, **kwargs):\n' +
      "    span = tracer.start_span('my_op')\n" +
      '    try:\n' +
      '        return orig(*args, **kwargs)\n' +
      '    finally:\n' +
      '        span.end()\n',
  },
  'error-status-no-event': {
    description:
      "Call record_exception() inside the wrapper's except block so the error view shows the stack trace.",
    before:
      'try:\n' +
      '    response = orig(*args, **kwargs)\n' +
      'except Exception as e:\n' +
      '    span.set_status(StatusCode.ERROR)\n' +
      '    raise\n',
    after:
      'try:\n' +
      '    response = orig(*args, **kwargs)\n' +
      'except Exception as e:\n' +
      '    span.set_status(StatusCode.ERROR, str(e))\n' +
      '    span.record_exception(e)\n' +
      '    raise\n',
  },
};

/**
 * Render a manual-fix snippet for the given finding code, or null if the
 * code has no registered snippet. The output is plain text suitable for
 * piping to a file or for the user to copy-paste.
 */
export function renderFixSnippet(code: string): string | null {
  const snippet = FIX_SNIPPETS[code];
  if (!snippet) return null;
  return (
    `# Finding: ${code}\n` +
    `# Suggested: ${snippet.description}\n` +
    `\n` +
    `# BEFORE:\n` +
    `${snippet.before}\n` +
    `\n` +
    `# AFTER:\n` +
    `${snippet.after}\n`
  );
}
