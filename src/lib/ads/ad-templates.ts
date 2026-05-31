// src/lib/ads/ad-templates.ts
// Browser-local (localStorage) store for reusable "repeatable ad" templates.
//
// A template snapshots the full wizard config needed to recreate an ad draft
// and jump straight to Review. There is NO backend, schema, or API — this is a
// pure client-side convenience layer. Templates only PREFILL the wizard; the
// user still clicks "Create Paused Ad", preserving the PAUSED invariant.

import type { AdDraft, AdTargeting, AdObjective } from '@/lib/meta/ads-types';

const STORAGE_KEY = 'goviraleza.adTemplates';

// Everything the wizard needs to fully restore a draft and land on Review.
// `applicationId` is also carried on the draft for APP objective; we keep a
// top-level copy so callers don't have to reach into the draft.
export interface AdTemplateConfig {
  brandId: string;
  objective: AdObjective;
  destinationUrl: string;
  applicationId?: string;
  draft: AdDraft;
  targeting: AdTargeting;
}

export interface AdTemplate {
  id: string;
  name: string;
  savedAt: number; // epoch ms
  config: AdTemplateConfig;
}

// Monotonic counter to keep ids unique even within the same millisecond. Reset
// per page load, which is fine because ids are also salted with the name and a
// uuid when available.
let idCounter = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'template';
}

function generateId(name: string): string {
  idCounter += 1;
  const base = slugify(name);
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : String(idCounter);
  return `${base}-${uuid}`;
}

// Read + parse the raw store. Corrupt or non-array JSON yields []; we never throw.
function readAll(): AdTemplate[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: keep only entries that look like templates.
    return parsed.filter(
      (t): t is AdTemplate =>
        Boolean(t) && typeof t === 'object' && typeof t.id === 'string' && typeof t.config === 'object',
    );
  } catch {
    return [];
  }
}

function writeAll(templates: AdTemplate[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // Quota or serialization failure — swallow; this is a best-effort cache.
  }
}

// Newest first.
export function listTemplates(): AdTemplate[] {
  return readAll().sort((a, b) => b.savedAt - a.savedAt);
}

// Save (immutably) a new template and return it. Trims the name; falls back to
// "Untitled ad" when blank.
export function saveTemplate(name: string, config: AdTemplateConfig): AdTemplate {
  const cleanName = name.trim() || 'Untitled ad';
  const template: AdTemplate = {
    id: generateId(cleanName),
    name: cleanName,
    savedAt: Date.now(),
    config,
  };
  const next = [template, ...readAll()];
  writeAll(next);
  return template;
}

export function deleteTemplate(id: string): void {
  const next = readAll().filter((t) => t.id !== id);
  writeAll(next);
}
