// Input limits leave room for long comparisons without trimming model answers.
export const ASK_MAX_BYTES = 256 * 1024;
export const ASK_MAX_QUESTION = 8_000;
export const ASK_MAX_TURNS = 40;
export const ASK_MAX_HISTORY_ANSWER = 64_000;
export const ASK_ERRORS = {
  question_too_long: "Keep your question under 8,000 characters.",
  history_too_long:
    "This conversation is long. Start a new conversation to keep asking.",
  body_too_large:
    "This conversation is long. Start a new conversation to keep asking.",
  body_timeout: "Sending took too long. Please try again.",
} as const;
