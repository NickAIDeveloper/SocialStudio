// src/lib/creative/qa.ts
//
// Quality gate for a rendered creative, run BEFORE it is composited or
// published.
//
// The method calls for "a vision model over the outputs" checking brand style
// guides and text readability. No multimodal model is available on the current
// credentials (Groq exposes 15 models, none vision-capable; there is no
// OpenAI/Anthropic key), so this does the same job deterministically instead —
// which for these particular failures is strictly better: free, instant, and
// exactly reproducible, so a rejection can be reasoned about rather than
// re-rolled.
//
// It targets bugs this codebase has actually shipped:
//   - an empty LLM hook reaching the libvips text renderer, which crashed the
//     whole god-mode request with "no text to render",
//   - unreadable overlays, where a white hook lands on a pale photo.
//
// What it deliberately does NOT do is judge whether the image is ON TOPIC.
// That genuinely needs vision or the existing brand-domain tag scoring, and
// guessing would be worse than abstaining.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

// WCAG AA for large text is 3:1, and that is the right bar for text on a FLAT
// colour. This is text on a PHOTOGRAPH, compared against the region's AVERAGE
// colour — so an average that scrapes 3:1 still guarantees that lighter parts
// of the image fall below it, and the hook goes unreadable exactly where the
// photo is brightest. The normal-text bar of 4.5:1 buys back that headroom.
// White on mid-grey measures 3.95:1: legible against flat grey, mush over a
// textured photo.
export const MIN_CONTRAST = 4.5;

// Beyond this a hook stops being a hook and starts being a paragraph.
const MAX_HOOK_CHARS = 120;

// Rough average glyph width as a fraction of font size for the display faces
// used in overlays. Deliberately an estimate: the aim is catching text that
// cannot possibly fit, not pixel-accurate layout.
const GLYPH_WIDTH_RATIO = 0.52;
const LINE_HEIGHT_RATIO = 1.25;

export type Check =
  | { ok: true; warnings: string[] }
  | { ok: false; code: string; detail: string };

export function checkHookRenderable(hook: string | null | undefined): Check {
  const text = (hook ?? '').trim();

  if (!text) {
    return {
      ok: false,
      code: 'empty_hook',
      detail: 'Hook is empty; the text renderer fails outright on an empty string.',
    };
  }
  // Punctuation-only survives a trim but renders as noise.
  if (!/[\p{L}\p{N}]/u.test(text)) {
    return {
      ok: false,
      code: 'unrenderable_hook',
      detail: `Hook "${text}" contains no letters or numbers.`,
    };
  }

  const warnings: string[] = [];
  if (text.length > MAX_HOOK_CHARS) {
    warnings.push(`Hook is ${text.length} characters, which is long enough to dominate the image.`);
  }
  return { ok: true, warnings };
}

// WCAG relative luminance.
function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function checkTextContrast(text: Rgb, background: Rgb): Check {
  const ratio = contrastRatio(text, background);
  if (ratio < MIN_CONTRAST) {
    return {
      ok: false,
      code: 'low_contrast',
      detail: `Contrast ratio ${ratio.toFixed(2)}:1 is below the ${MIN_CONTRAST}:1 minimum for large text; the hook will be hard to read.`,
    };
  }
  return { ok: true, warnings: [] };
}

export interface TextBox {
  fontSize: number;
  boxWidth: number;
  boxHeight: number;
}

// Will the hook physically fit? An estimate, but a decisive one for the cases
// that matter — a 300-character hook at 120px cannot fit any sane box.
export function estimateTextFit(text: string, box: TextBox): Check {
  const charsPerLine = Math.max(1, Math.floor(box.boxWidth / (box.fontSize * GLYPH_WIDTH_RATIO)));
  const lines = Math.ceil(text.length / charsPerLine);
  const requiredHeight = lines * box.fontSize * LINE_HEIGHT_RATIO;

  if (requiredHeight > box.boxHeight) {
    return {
      ok: false,
      code: 'text_overflow',
      detail: `Hook needs about ${Math.round(requiredHeight)}px across ${lines} lines but the box is ${box.boxHeight}px; it will be clipped.`,
    };
  }
  return { ok: true, warnings: [] };
}

export interface CreativeAuditInput {
  hook: string | null | undefined;
  textColour: Rgb;
  // Average colour of the image region beneath the text. Null when the image
  // could not be sampled — unknown is not the same as bad.
  backgroundColour: Rgb | null;
  fontSize: number;
  boxWidth: number;
  boxHeight: number;
}

export interface CreativeIssue {
  code: string;
  severity: 'error' | 'warning';
  detail: string;
}

// Runs every check and reports all findings, so one pass shows the full picture
// rather than revealing problems one re-render at a time.
export function auditCreative(input: CreativeAuditInput): CreativeIssue[] {
  const issues: CreativeIssue[] = [];

  const hookCheck = checkHookRenderable(input.hook);
  if (!hookCheck.ok) {
    issues.push({ code: hookCheck.code, severity: 'error', detail: hookCheck.detail });
  } else {
    for (const warning of hookCheck.warnings) {
      issues.push({ code: 'long_hook', severity: 'warning', detail: warning });
    }
  }

  if (input.backgroundColour) {
    const contrast = checkTextContrast(input.textColour, input.backgroundColour);
    if (!contrast.ok) {
      issues.push({ code: contrast.code, severity: 'error', detail: contrast.detail });
    }
  }

  const hook = (input.hook ?? '').trim();
  if (hook) {
    const fit = estimateTextFit(hook, {
      fontSize: input.fontSize,
      boxWidth: input.boxWidth,
      boxHeight: input.boxHeight,
    });
    if (!fit.ok) {
      issues.push({ code: fit.code, severity: 'error', detail: fit.detail });
    }
  }

  return issues;
}
