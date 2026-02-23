---
name: preference-detector
description: |
  Detect and analyze user preferences from conversation history. Use when:
  (1) User expresses dissatisfaction with responses (e.g., "too long", "too brief", "explain too much")
  (2) User explicitly asks to analyze their preferences
  (3) After multiple conversations to understand user's communication style
  (4) User gives feedback like "I prefer concise answers" or "be more detailed"

  This skill uses LLM to intelligently analyze conversation patterns beyond simple keyword matching.
---

# Preference Detector

Analyze user preferences from conversation history to suggest personality/behavior adaptations.

## When to Use

Use this skill when you notice patterns in user communication:

- **Explicit feedback**: User says "be more concise", "too detailed", "don't explain too much"
- **Implicit patterns**: User consistently asks for short answers or detailed explanations
- **Tone preferences**: User uses formal/informal language, responds better to certain styles
- **Request analysis**: User explicitly asks "what are my preferences?" or "analyze my communication style"

## How It Works

1. Analyze recent conversation history (last N messages)
2. Identify patterns in user feedback and communication style
3. Generate structured preference report
4. Suggest specific adaptations (optional)

## Output Format

Return a JSON report with this structure:

```json
{
  "preferences": [
    {
      "type": "response_length",
      "value": "concise|detailed|balanced",
      "confidence": 0.85,
      "evidence": ["user message 1", "user message 2"],
      "suggestion": "Adapt responses to be more concise"
    }
  ],
  "summary": "User prefers concise, direct responses without excessive explanation"
}
```

## Preference Types to Detect

| Type | Values | Indicators |
|------|--------|------------|
| response_length | concise, detailed, balanced | "too long", "be brief", "more details" |
| explanation_level | minimal, moderate, extensive | "don't explain", "just do it", "explain step by step" |
| tone | formal, casual, flexible | "please", "thanks", "hey", "算了" |
| format | bullet, paragraph, code, mixed | "use bullet points", "just text" |
| interaction_style | direct, exploratory, collaborative | "just answer", "what do you think" |

## Analysis Guidelines

1. **Look for explicit feedback**: Direct statements about preferences
2. **Infer from patterns**: Repeated behaviors indicate preferences
3. **Consider context**: Same phrase may mean different things in context
4. **Confidence scoring**: Rate confidence based on evidence strength
5. **Avoid overfitting**: Single instances may not indicate preference

## Integration with Evolution System

If preferences are detected with high confidence (>0.7):

1. Use the evolution-proposer tool to create a formal proposal
2. The proposal will be stored and require user approval before applying
3. User can review and approve/reject in Settings > Evolution Records

## Example Analysis

**Conversation excerpt:**
```
User: "帮我写个函数"
User: "直接给答案吧，不用解释太多"
User: "简洁点"
```

**Analysis result:**
```json
{
  "preferences": [
    {
      "type": "response_length",
      "value": "concise",
      "confidence": 0.95,
      "evidence": ["直接给答案吧，不用解释太多", "简洁点"],
      "suggestion": "Keep responses brief, avoid unnecessary explanations"
    }
  ],
  "summary": "User strongly prefers concise responses without extended explanations"
}
```
