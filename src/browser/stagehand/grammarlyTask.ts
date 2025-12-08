import type { Stagehand } from "@browserbasehq/stagehand";
import { log } from "../../config";
import { GrammarlyExtractSchema } from "./schemas";

const MAX_TEXT_LENGTH = 8000;

export interface GrammarlyTaskOptions {
  maxSteps?: number;
  iteration?: number;
  mode?: string;
}

export interface GrammarlyTaskResult {
  aiDetectionPercent: number | null;
  plagiarismPercent: number | null;
  overallScore?: number | null;
  notes: string;
}

/**
 * Sleep utility
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run Grammarly scoring task using Stagehand's deterministic automation.
 * Uses the observe()->act()->extract() pattern for reliable, fast execution.
 */
export async function runStagehandGrammarlyTask(
  stagehand: Stagehand,
  text: string,
  options?: GrammarlyTaskOptions,
): Promise<GrammarlyTaskResult> {
  // Access page via context API (V3)
  const page = stagehand.context.pages()[0];
  if (!page) {
    throw new Error("No page available in Stagehand context");
  }

  const truncatedText =
    text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;

  log("debug", "Starting Stagehand Grammarly scoring task", {
    textLength: text.length,
    truncated: text.length > MAX_TEXT_LENGTH,
    iteration: options?.iteration,
    mode: options?.mode,
  });

  try {
    // Step 1: Navigate to Grammarly if not already there
    const currentUrl = page.url();
    if (!currentUrl.includes("app.grammarly.com")) {
      log("debug", "Navigating to Grammarly");
      await page.goto("https://app.grammarly.com", {
        waitUntil: "networkidle",
      });
      await sleep(2000);
    }

    // Step 2: Create a new document using observe -> act pattern
    log("debug", "Looking for new document button");
    const newDocObservation = await stagehand.observe(
      "Find the button or link to create a new document. Look for 'New', 'New document', '+', or similar options in the interface.",
    );

    const newDocElement = newDocObservation?.[0];
    if (newDocElement) {
      log("debug", "Found new document element, clicking", {
        element: newDocElement,
      });
      // Pass the observed action directly to act()
      await stagehand.act(newDocElement);
    } else {
      // Fallback: try direct action with instruction string
      log("debug", "No element observed, trying direct action");
      await stagehand.act(
        "Click on 'New' or the button to create a new document in the Grammarly interface",
      );
    }

    // Step 3: Wait for editor to load
    await sleep(2000);

    // Step 4: Clear any existing content and paste new text
    log("debug", "Pasting text into editor");

    // Try to find and focus the editor first
    await stagehand.act("Click on the main text editor area to focus it");

    await sleep(500);

    // Clear existing content using stagehand act (keyboard simulation)
    await stagehand.act("Select all text in the editor using Ctrl+A or Cmd+A");
    await sleep(100);

    // Type the text using stagehand's act for short text, or page API for long text
    log("debug", "Typing text into editor");

    // For shorter texts, type directly using stagehand
    if (truncatedText.length <= 500) {
      await stagehand.act(`Type the following text exactly: ${truncatedText}`);
    } else {
      // For longer texts, use clipboard API to paste the full content directly
      log("debug", "Pasting long text via clipboard API");
      await page.evaluate(async (textToPaste) => {
        // Find the contenteditable element (Grammarly editor)
        const editor = document.querySelector('[contenteditable="true"]');
        if (editor) {
          // Use clipboard API for reliable pasting
          await navigator.clipboard.writeText(textToPaste);
          // Focus the editor
          (editor as HTMLElement).focus();
          // Trigger paste
          document.execCommand("paste");
        } else {
          throw new Error("Could not find contenteditable editor");
        }
      }, truncatedText);
      await sleep(500);
    }

    log("debug", "Text pasted into editor");
    await sleep(2000);

    // Step 5: Trigger AI Detection check
    log("debug", "Looking for AI detection button");

    // First observe to find the AI detection/plagiarism check option
    const aiDetectObservation = await stagehand.observe(
      "Find the button or option to check for AI-generated text or plagiarism. Look for 'AI', 'AI Detection', 'Plagiarism', 'Check for AI', or similar options in the sidebar or toolbar.",
    );

    const aiDetectElement = aiDetectObservation?.[0];
    if (aiDetectElement) {
      log("debug", "Found AI detection element", {
        element: aiDetectElement,
      });
      await stagehand.act(aiDetectElement);
    } else {
      // Try navigating to the specific panel
      await stagehand.act(
        "Open the AI detection panel or click on 'Check for AI text & plagiarism' option in the Grammarly interface",
      );
    }

    // Step 6: Wait for results to load
    log("debug", "Waiting for AI detection results");
    await sleep(5000);

    // Step 7: Extract scores using Stagehand's extract with Zod schema
    // V3 API: stagehand.extract("instruction", schema)
    log("debug", "Extracting Grammarly scores");

    const extractResult = await stagehand.extract(
      `Look at the Grammarly interface and extract the following information:
        1. AI Detection Percentage: The percentage showing how much of the text appears to be AI-generated (0-100).
           This might be labeled as "AI-generated", "Likely AI", "AI content detected", etc.
           If you see text like "probably AI-written" without a number, estimate based on the severity shown.
        2. Plagiarism Percentage: The percentage of content that matches existing sources (0-100).
           This might be labeled as "Plagiarism", "Originality", "Similar content found", etc.
           Note: If shown as "originality" (e.g., "95% original"), convert to plagiarism (100 - originality).
        3. Overall Score: The overall Grammarly performance score if visible (optional).
        4. Notes: Any relevant observations about what you see, including if features are unavailable.

        If a percentage is not visible or the feature is not available, set it to null.`,
      GrammarlyExtractSchema,
    );

    log("info", "Extracted Grammarly scores", {
      aiDetectionPercent: extractResult.aiDetectionPercent,
      plagiarismPercent: extractResult.plagiarismPercent,
      overallScore: extractResult.overallScore,
    });

    return {
      aiDetectionPercent: extractResult.aiDetectionPercent,
      plagiarismPercent: extractResult.plagiarismPercent,
      overallScore: extractResult.overallScore,
      notes: extractResult.notes,
    };
  } catch (error) {
    log("error", "Stagehand Grammarly task failed", { error });

    // Try to extract whatever we can see
    try {
      const fallbackResult = await stagehand.extract(
        "Extract any visible AI detection or plagiarism scores from the current page. If none are visible, explain what you see.",
        GrammarlyExtractSchema,
      );

      return {
        aiDetectionPercent: fallbackResult.aiDetectionPercent,
        plagiarismPercent: fallbackResult.plagiarismPercent,
        overallScore: fallbackResult.overallScore,
        notes: `Error during task, partial extraction: ${fallbackResult.notes}`,
      };
    } catch {
      throw error;
    }
  }
}

/**
 * Attempt to clean up a Grammarly document after scoring.
 * This helps keep the Grammarly workspace clean.
 */
export async function cleanupGrammarlyDocument(
  stagehand: Stagehand,
): Promise<void> {
  try {
    // Try to delete or close the current document
    await stagehand.act(
      "Delete the current document or close it without saving to clean up",
    );
    log("debug", "Cleaned up Grammarly document");
  } catch {
    log("debug", "Could not clean up Grammarly document (non-critical)");
  }
}
