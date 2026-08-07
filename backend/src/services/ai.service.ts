/**
 * `aiService` is the stable entry point every consumer (audit worker,
 * creative service, calendar service, etc.) imports. It now delegates to
 * `localAiService` — a standalone, dependency-free generator — instead of
 * calling an external AI provider. Kept as a thin wrapper so call sites
 * don't need to change, and so a different backend could be swapped in
 * here later without touching callers.
 */
import { localAiService } from './local-ai.service';

export const aiService = localAiService;
