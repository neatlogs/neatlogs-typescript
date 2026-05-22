import { google } from "@ai-sdk/google";
import { experimental_wrapLanguageModel as wrapLanguageModel } from "ai";
import * as ai from "ai";
import { wrapAISDK } from "neatlogs/ai";

import { customMiddleware } from "./custom-middleware";

const wrappedAI = wrapAISDK(ai);
console.log('[neatlogs/debug] wrapAISDK applied, streamText wrapped:', wrappedAI.streamText !== ai.streamText);

export const { streamText, generateText, generateObject, streamObject } = wrappedAI;

export const geminiProModel = wrapLanguageModel({
  model: google("gemini-2.5-pro"),
  middleware: customMiddleware,
});

export const geminiFlashModel = wrapLanguageModel({
  model: google("gemini-2.5-flash"),
  middleware: customMiddleware,
});
