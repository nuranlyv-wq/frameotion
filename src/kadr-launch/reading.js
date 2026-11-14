export const MAX_READING_SECONDS = 1.2;

// A budget for a pause devoted to reading, not the lifetime of a visible actor.
// Readability checks still measure the full copy independently.
export function readingBudget(text, {fps = 30, minimum = 22, perWord = 6} = {}) {
  const words = String(text ?? '').trim().split(/\s+/u).filter(Boolean).length;
  return Math.min(Math.floor(MAX_READING_SECONDS * fps), Math.ceil(Math.max(minimum, words * perWord) * fps / 30));
}

export const READING_DIRECTION = `Allow at most 1.2 seconds for each pause devoted to reading, including the final payoff. This limit applies to both ordinary and superdynamic films. Write short phrases that can be read within that budget. Split longer information across successive meaningful phases instead of extending a static hold. Preserve requested exact copy and factual qualifiers across those phases. Existing copy or a continuous subject may remain visible while the next meaningful action happens; actor lifetime is not a reading pause.`;
