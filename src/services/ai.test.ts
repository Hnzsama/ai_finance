import { aiService } from "./ai.js";

async function testAI() {
  console.log("Testing Ollama AI connection...");
  const sample = "kopi kenangan 28k pake gopay";
  const result = await aiService.parseMessage(sample);
  console.log("Input:", sample);
  console.log("Result:", JSON.stringify(result, null, 2));
}

void testAI();
