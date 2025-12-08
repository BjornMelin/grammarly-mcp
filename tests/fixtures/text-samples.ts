/**
 * Short text sample for quick tests.
 */
export const shortText = "This is a short sample text for testing.";

/**
 * Medium-length text sample with multiple sentences.
 */
export const mediumText = `Lorem ipsum dolor sit amet, consectetur adipiscing elit.
Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.`;

/**
 * Boundary text at exactly 8000 characters (truncation limit).
 */
export const boundaryText = "x".repeat(8000);

/**
 * Long text above the Opus model threshold (>12000 chars).
 */
export const longText = "y".repeat(12000);

/**
 * Very long text that exceeds Opus threshold significantly.
 */
export const veryLongText = "z".repeat(15000);

/**
 * Text with AI-like patterns that might trigger detection.
 */
export const aiLikeText = `In conclusion, it is important to note that the aforementioned factors
contribute significantly to the overall outcome. Furthermore, research has
demonstrated that these elements play a crucial role in determining success.
Moreover, it should be emphasized that careful consideration of these aspects
is essential for achieving optimal results. Additionally, one must acknowledge
that the implementation of these strategies requires a comprehensive approach.`;

/**
 * Text that appears more human-written.
 */
export const humanLikeText = `I've been thinking about this problem for a while now, and honestly,
it's not as straightforward as people make it out to be. You know how
sometimes you just feel like something's off? That's exactly what happened
here. After trying a bunch of different approaches - some worked, some
didn't - I finally landed on something that seems to stick.`;

/**
 * Empty and whitespace edge cases.
 */
export const emptyText = "";
export const whitespaceText = "   ";
export const singleChar = "a";

/**
 * Text with special characters and unicode.
 */
export const specialCharsText =
  'Test with "quotes", <brackets>, & ampersands, and émojis 🎉';
