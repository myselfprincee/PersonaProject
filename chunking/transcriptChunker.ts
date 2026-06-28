export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Chunk {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  wordCount: number;
  chunkText: string;
  embedding?: number[];
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function parseJson3Transcript(raw: any): TranscriptSegment[] {
  if (!raw?.events) return [];

  const segments: TranscriptSegment[] = [];

  for (const event of raw.events) {
    if (!event.segs) continue;

    const text = event.segs
      .map((seg: any) => seg.utf8)
      .join("")
      .replace(/\s+/g, " ")
      .trim();

    if (!text) continue;

    segments.push({
      text,
      startMs: event.tStartMs ?? 0,
      endMs: (event.tStartMs ?? 0) + (event.dDurationMs ?? 0),
    });
  }

  return segments;
}

export function buildChunks(
  segments: TranscriptSegment[],
  targetWords = 320,
  overlapWords = 60
): Chunk[] {
  const chunks: Chunk[] = [];

  let currentSegments: TranscriptSegment[] = [];
  let currentWords = 0;
  let chunkIndex = 0;

  for (const segment of segments) {
    const words = countWords(segment.text);

    currentSegments.push(segment);
    currentWords += words;

    if (currentWords >= targetWords) {
      chunks.push({
        chunkIndex,
        startMs: currentSegments[0].startMs,
        endMs: currentSegments[currentSegments.length - 1].endMs,
        wordCount: currentWords,
        chunkText: currentSegments
          .map((s) => s.text)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim(),
      });

      chunkIndex++;

      // Build overlap
      const overlap: TranscriptSegment[] = [];
      let overlapCount = 0;

      for (let i = currentSegments.length - 1; i >= 0; i--) {
        overlap.unshift(currentSegments[i]);

        overlapCount += countWords(currentSegments[i].text);

        if (overlapCount >= overlapWords) {
          break;
        }
      }

      currentSegments = overlap;
      currentWords = overlapCount;
    }
  }

  if (currentSegments.length) {
    chunks.push({
      chunkIndex,
      startMs: currentSegments[0].startMs,
      endMs: currentSegments[currentSegments.length - 1].endMs,
      wordCount: currentWords,
      chunkText: currentSegments
        .map((s) => s.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    });
  }

  return chunks;
}