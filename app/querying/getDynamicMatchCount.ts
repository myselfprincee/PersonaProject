const SIMPLE_MATCH_COUNT = 4;
const MAX_MATCH_COUNT = 10;
const MIN_MATCH_COUNT = 3;

const BROAD_QUERY_PATTERNS = [
  /\bhow\b/,
  /\bwhy\b/,
  /\bcompare\b/,
  /\bcomparison\b/,
  /\bversus\b/,
  /\bvs\b/,
  /\bdifference\b/,
  /\boverall\b/,
  /\bmost\b/,
  /\busually\b/,
  /\boften\b/,
  /\bpattern\b/,
  /\btopics\b/,
  /\badvice\b/,
  /\bprocess\b/,
  /\bworkflow\b/,
  /\bmindset\b/,
  /\bstrategy\b/,
  /\blist\b/,
  /\bsummarize\b/,
  /\bsummary\b/,
];

const TIMELINE_QUERY_PATTERNS = [
  /\bever\b/,
  /\bpreviously\b/,
  /\bbefore\b/,
  /\bwhen did\b/,
  /\bfirst time\b/,
  /\btimeline\b/,
  /\bhistory\b/,
];

export function getDynamicMatchCount(question: string) {
  const normalizedQuestion = question.trim().toLowerCase();
  const words = normalizedQuestion.split(/\s+/).filter(Boolean);

  let matchCount = SIMPLE_MATCH_COUNT;

  if (words.length >= 10) {
    matchCount += 1;
  }

  if (words.length >= 18) {
    matchCount += 1;
  }

  if (BROAD_QUERY_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    matchCount += 2;
  }

  if (TIMELINE_QUERY_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    matchCount += 1;
  }

  const clauseCount = normalizedQuestion
    .split(/\?|,|;|\band\b|\bor\b/)
    .map((part) => part.trim())
    .filter(Boolean).length;

  if (clauseCount >= 3) {
    matchCount += 1;
  }

  return Math.max(MIN_MATCH_COUNT, Math.min(MAX_MATCH_COUNT, matchCount));
}
