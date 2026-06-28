type ConversationContext = {
  previousQuestion: string;
  previousAnswer: string;
};

const FOLLOW_UP_PATTERNS = [
  /^and\b/i,
  /^what about\b/i,
  /^how about\b/i,
  /^why\b/i,
  /^how\b/i,
  /^when\b/i,
  /^where\b/i,
  /^which\b/i,
  /^can you\b/i,
  /^could you\b/i,
  /^so\b/i,
  /\bthat\b/i,
  /\bthis\b/i,
  /\bit\b/i,
  /\bthey\b/i,
  /\bthose\b/i,
  /\bthem\b/i,
  /\belaborate\b/i,
  /\bexpand\b/i,
  /\bmore about\b/i,
];

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength).trim()}…`;
}

export function isLikelyFollowUpQuestion(question: string) {
  const normalizedQuestion = question.trim();

  if (normalizedQuestion.split(/\s+/).filter(Boolean).length <= 8) {
    return true;
  }

  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedQuestion));
}

export function buildFollowUpAwareRetrievalQuery(
  question: string,
  conversationContext?: ConversationContext | null,
) {
  if (!conversationContext || !isLikelyFollowUpQuestion(question)) {
    return question;
  }

  return [
    `Previous user question: ${truncate(conversationContext.previousQuestion, 280)}`,
    `Previous assistant reply: ${truncate(conversationContext.previousAnswer, 600)}`,
    `Follow-up question: ${question}`,
  ].join("\n");
}
