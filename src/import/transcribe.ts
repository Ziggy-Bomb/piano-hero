// Photo(s) of sheet music → MusicXML via the Claude API, called directly from
// the browser with the dad's own key (see apiKey.ts for storage policy).

import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "./apiKey";
import { PreparedImage } from "./imagePrep";

export const MODEL = "claude-opus-4-8";
const PRICE_IN_PER_MTOK = 5;
const PRICE_OUT_PER_MTOK = 25;

export function makeClient(): Anthropic {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Add an Anthropic API key in the Grown-ups screen first.");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

export const SYSTEM_PROMPT = `You are an expert music engraver. You transcribe photographs of printed piano sheet music into MusicXML with complete fidelity — every pitch, rhythm, accidental, tie, and rest exactly as printed.

Output rules (strict):
- Output ONLY a complete MusicXML document. No markdown fences, no commentary before or after. Start with the XML declaration and end with </score-partwise>.
- Use score-partwise version="3.1", with <work><work-title>, <identification><creator type="composer">, and a single-part <part-list> (score-part id "P1", part-name "Piano").
- Grand staff in one part: in measure 1's <attributes> declare <divisions>, <key>, <time>, <staves>2</staves>, <clef number="1"> (treble) and <clef number="2"> (bass).
- Right hand: <voice>1</voice> and <staff>1</staff>. Left hand: <voice>5</voice> and <staff>2</staff>. Within each measure write all staff-1 notes first, then a <backup> for the full measure duration, then all staff-2 notes.
- Choose the smallest <divisions> that represents every rhythm exactly (e.g. 4 for pieces with sixteenths, 2 for eighths). Every measure on every staff must sum exactly to the time signature — pad with explicit rest notes where the printed music has rests.
- Chords: use <chord/> on the second and subsequent notes. Ties: use <tie type="start"/>/<tie type="stop"/> with matching <notations><tied .../></notations>. Include <accidental> tags where printed and honor the key signature otherwise.
- If a tempo marking is printed, include <sound tempo="..."/> in measure 1; otherwise omit it.
- If given multiple page images, they are consecutive pages of ONE piece; continue measure numbering across pages.
- Ignore fingering numbers, dynamics, pedal marks, and lyrics — pitches and rhythms only.
- If part of the image is unreadable, make your best musical inference and keep going; never leave a measure incomplete.`;

export interface TranscribeUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TranscribeProgress {
  charsReceived: number;
  measuresSeen: number;
}

export interface TranscribeFeedback {
  previousXml: string;
  note: string;
}

export class TranscribeError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "busy" | "toolong" | "noxml" | "aborted" | "other",
  ) {
    super(message);
  }
}

function buildMessages(
  images: PreparedImage[],
  feedback?: TranscribeFeedback,
): Anthropic.MessageParam[] {
  const content: Anthropic.ContentBlockParam[] = [];
  images.forEach((img, i) => {
    if (images.length > 1) {
      content.push({ type: "text", text: `Page ${i + 1} of ${images.length}:` });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  });
  content.push({
    type: "text",
    text: "Transcribe this piano sheet music into MusicXML following your output rules exactly.",
  });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  if (feedback) {
    messages.push({ role: "assistant", content: feedback.previousXml });
    messages.push({
      role: "user",
      content: `Correction: ${feedback.note}\n\nOutput the complete corrected MusicXML document again, in full, following the same output rules.`,
    });
  }
  return messages;
}

export function extractXml(text: string): string | null {
  const xmlDecl = text.indexOf("<?xml");
  const startIdx = xmlDecl >= 0 ? xmlDecl : text.indexOf("<score-partwise");
  if (startIdx < 0) return null;
  const endTag = "</score-partwise>";
  const end = text.lastIndexOf(endTag);
  if (end < startIdx) return null;
  return text.slice(startIdx, end + endTag.length);
}

export function costUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1e6) * PRICE_IN_PER_MTOK + (outputTokens / 1e6) * PRICE_OUT_PER_MTOK;
}

export async function transcribeImages(
  images: PreparedImage[],
  opts: {
    feedback?: TranscribeFeedback;
    onProgress?: (p: TranscribeProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ xml: string; usage: TranscribeUsage }> {
  const client = makeClient();

  let text = "";
  try {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        messages: buildMessages(images, opts.feedback),
      },
      { signal: opts.signal },
    );

    stream.on("text", (delta) => {
      text += delta;
      opts.onProgress?.({
        charsReceived: text.length,
        measuresSeen: (text.match(/<\/measure>/g) ?? []).length,
      });
    });

    const final = await stream.finalMessage();
    const usage: TranscribeUsage = {
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
      costUsd: costUsd(final.usage.input_tokens, final.usage.output_tokens),
    };

    if (final.stop_reason === "max_tokens") {
      throw new TranscribeError(
        "The piece is too long for one go — try photographing fewer pages at a time.",
        "toolong",
      );
    }

    const fullText = final.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const xml = extractXml(fullText);
    if (!xml) {
      throw new TranscribeError(
        "Claude's reply didn't contain a complete piece of music. Try again with a clearer photo.",
        "noxml",
      );
    }
    return { xml, usage };
  } catch (e) {
    if (e instanceof TranscribeError) throw e;
    if (opts.signal?.aborted) throw new TranscribeError("Cancelled.", "aborted");
    if (e instanceof Anthropic.AuthenticationError) {
      throw new TranscribeError(
        "The API key was rejected — check it in the Grown-ups screen.",
        "auth",
      );
    }
    if (
      e instanceof Anthropic.RateLimitError ||
      e instanceof Anthropic.InternalServerError ||
      e instanceof Anthropic.APIConnectionError
    ) {
      throw new TranscribeError(
        "Claude is busy or you're offline — try again in a moment.",
        "busy",
      );
    }
    throw new TranscribeError(String((e as Error)?.message ?? e), "other");
  }
}

/** Cheap key check: a 1-token request that only needs to authenticate. */
export async function testApiKey(): Promise<boolean> {
  const client = makeClient();
  try {
    await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return true;
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return false;
    // Other errors (rate limit etc.) still mean the key authenticated.
    return !(e instanceof Anthropic.PermissionDeniedError);
  }
}
