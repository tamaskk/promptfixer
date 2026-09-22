import { test } from "node:test";
import assert from "node:assert/strict";
import { compilePrompt, extractVariables } from "../variables";

test("extractVariables returns unique names with defaults", () => {
  const content = "Write about ${topic} in ${tone:friendly} tone. More on ${topic}.";
  assert.deepEqual(extractVariables(content), [
    { name: "topic", defaultValue: "" },
    { name: "tone", defaultValue: "friendly" },
  ]);
});

test("compilePrompt fills values and falls back to defaults", () => {
  const template = "Explain ${concept} for a ${level:beginner}.";
  assert.equal(compilePrompt(template, { concept: "recursion", level: "" }), "Explain recursion for a beginner.");
});

test("compilePrompt keeps placeholders without value or default", () => {
  assert.equal(compilePrompt("Hello ${name}", {}), "Hello ${name}");
});
