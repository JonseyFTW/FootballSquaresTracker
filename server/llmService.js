// LLM Service for parsing football squares images
// Supports: Gemini, Claude, OpenAI

const EXTRACTION_PROMPT = `Analyze this football squares grid image and extract all the data.

First determine the board type:
- "10x10": A 10x10 grid with 100 individual squares (each header shows 1 digit)
- "5x5": A 5x5 grid with 25 squares (each header shows 2 digits)
- "strip-10": A 10-player strip board where only 10 players each own a block of squares spanning multiple rows/columns. Look for: only ~10 player names, large merged cells, or players spanning across multiple grid positions.

Return a JSON object with EXACTLY this structure (no markdown, just raw JSON):

FOR 5x5 or 10x10 boards:
{
  "type": "5x5" or "10x10",
  "xTeamName": "Team name on top/horizontal axis",
  "yTeamName": "Team name on left/vertical axis",
  "xAxis": [array of 10 digits 0-9 in order as shown on x-axis, left to right],
  "yAxis": [array of 10 digits 0-9 in order as shown on y-axis, top to bottom],
  "squares": [
    {"number": 1, "row": 0, "col": 0, "owner": "Name or empty string"},
    ... (all squares in order, row by row)
  ],
  "prizes": {
    "q1": quarter 1 prize amount as number or 0,
    "half": halftime prize amount as number or 0,
    "q3": quarter 3 prize amount as number or 0,
    "final": final prize amount as number or 0
  }
}

FOR strip-10 boards:
{
  "type": "strip-10",
  "xTeamName": "Team name on top/horizontal axis (the team with more digit columns)",
  "yTeamName": "Team name on left/vertical axis",
  "xAxis": [array of 10 digits 0-9 in order as shown on x-axis, left to right],
  "yAxis": [array of 10 digits 0-9 in order as shown on y-axis, top to bottom],
  "squares": [
    {"number": 1, "owner": "Player name", "xDigits": [the X-axis digits this player's block covers], "yDigits": [the Y-axis digits this player's block covers]},
    ... (all 10 players in order)
  ],
  "prizes": {
    "q1": quarter 1 prize amount as number or 0,
    "half": halftime prize amount as number or 0,
    "q3": quarter 3 prize amount as number or 0,
    "final": final prize amount as number or 0
  }
}

CRITICAL - Axis number rules:
- xAxis must contain EXACTLY the digits 0,1,2,3,4,5,6,7,8,9 (each digit appears ONCE)
- yAxis must contain EXACTLY the digits 0,1,2,3,4,5,6,7,8,9 (each digit appears ONCE)
- NO duplicates allowed - each axis is a permutation of 0-9
- Read carefully: 6 vs 9, 1 vs 7, 0 vs 8 can look similar
- If unsure about a digit, consider which digits are already used to avoid duplicates

Grid details:
- For 5x5 grids: 25 squares total (5 rows x 5 cols), each header shows 2 digits
- For 10x10 grids: 100 squares total, each header shows 1 digit
- For strip-10: 10 players total, each spanning a block of the grid (typically 5 columns x 2 rows)
- Square numbers go 1-25 (5x5), 1-100 (10x10), or 1-10 (strip-10)
- Extract owner names exactly as shown (empty string "" if blank)

For strip-10 boards:
- Each player typically covers 5 X-axis digits and 2 Y-axis digits
- Look at which columns and rows each player's cell spans
- The xDigits are the axis digits corresponding to those columns
- The yDigits are the axis digits corresponding to those rows

Prize amounts should be numbers without $ symbol`;

// Gemini API (Google AI)
async function parseWithGemini(imageBase64, apiKey) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: 'image/png',
                data: imageBase64
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096
        }
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${error}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('No response from Gemini');
  }

  return parseJsonResponse(text);
}

// Claude API (Anthropic)
async function parseWithClaude(imageBase64, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64
            }
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${error}`);
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;

  if (!text) {
    throw new Error('No response from Claude');
  }

  return parseJsonResponse(text);
}

// OpenAI API
async function parseWithOpenAI(imageBase64, apiKey) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: EXTRACTION_PROMPT
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imageBase64}`
            }
          }
        ]
      }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('No response from OpenAI');
  }

  return parseJsonResponse(text);
}

// Parse JSON from LLM response (handles markdown code blocks)
function parseJsonResponse(text) {
  // Remove markdown code blocks if present
  let jsonStr = text.trim();

  // Handle ```json ... ``` format
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateAndNormalize(parsed);
  } catch (e) {
    throw new Error(`Failed to parse LLM response as JSON: ${e.message}\nResponse: ${text.substring(0, 500)}`);
  }
}

// Validate and normalize the parsed data
function validateAndNormalize(data) {
  // Validate required fields
  if (!data.type || !['5x5', '10x10', 'strip-10'].includes(data.type)) {
    throw new Error('Invalid or missing board type');
  }

  if (!data.xTeamName || !data.yTeamName) {
    throw new Error('Missing team names');
  }

  if (data.type === 'strip-10') {
    // Strip-10 validation
    // Axes are optional for strip-10 (used for reference but digits are on squares)
    if (Array.isArray(data.xAxis) && data.xAxis.length > 0) {
      data.xAxis = normalizeAxis(data.xAxis);
    } else {
      data.xAxis = [];
    }
    if (Array.isArray(data.yAxis) && data.yAxis.length > 0) {
      data.yAxis = normalizeAxis(data.yAxis);
    } else {
      data.yAxis = [];
    }

    // Validate squares
    if (!Array.isArray(data.squares) || data.squares.length !== 10) {
      throw new Error(`Expected 10 squares for strip-10, got ${data.squares?.length || 0}`);
    }

    // Normalize strip-10 squares
    data.squares = data.squares.map((sq, idx) => ({
      number: sq.number || idx + 1,
      xDigits: (sq.xDigits || []).map(d => parseInt(d, 10)).filter(d => !isNaN(d)),
      yDigits: (sq.yDigits || []).map(d => parseInt(d, 10)).filter(d => !isNaN(d)),
      owner: sq.owner || ''
    }));
  } else {
    // Grid type validation
    if (!Array.isArray(data.xAxis) || !Array.isArray(data.yAxis)) {
      throw new Error('Missing axis data');
    }

    // Normalize axis arrays to have exactly 10 digits
    data.xAxis = normalizeAxis(data.xAxis);
    data.yAxis = normalizeAxis(data.yAxis);

    // Validate squares
    const expectedSquares = data.type === '5x5' ? 25 : 100;
    if (!Array.isArray(data.squares) || data.squares.length !== expectedSquares) {
      throw new Error(`Expected ${expectedSquares} squares, got ${data.squares?.length || 0}`);
    }

    // Normalize squares
    data.squares = data.squares.map((sq, idx) => ({
      number: sq.number || idx + 1,
      row: sq.row ?? Math.floor(idx / (data.type === '5x5' ? 5 : 10)),
      col: sq.col ?? idx % (data.type === '5x5' ? 5 : 10),
      owner: sq.owner || ''
    }));
  }

  // Normalize prizes
  data.prizes = {
    q1: Number(data.prizes?.q1) || 0,
    half: Number(data.prizes?.half) || 0,
    q3: Number(data.prizes?.q3) || 0,
    final: Number(data.prizes?.final) || 0
  };

  return data;
}

// Normalize axis to ensure 10 unique digits (0-9 each appearing once)
function normalizeAxis(axis) {
  const normalized = axis.map(d => {
    const num = parseInt(String(d), 10);
    return isNaN(num) ? -1 : num % 10;
  });

  // Ensure we have exactly 10 slots
  while (normalized.length < 10) {
    normalized.push(-1);
  }

  // Find which digits are present and which are missing
  const digitCounts = {};
  for (let i = 0; i < 10; i++) digitCounts[i] = 0;

  normalized.slice(0, 10).forEach(d => {
    if (d >= 0 && d <= 9) digitCounts[d]++;
  });

  const missing = [];
  const duplicatePositions = [];

  for (let i = 0; i < 10; i++) {
    if (digitCounts[i] === 0) missing.push(i);
  }

  // Find positions with duplicates or invalid values and replace with missing digits
  const seen = new Set();
  for (let i = 0; i < 10; i++) {
    const d = normalized[i];
    if (d < 0 || d > 9 || seen.has(d)) {
      // This position has invalid or duplicate digit - replace with a missing one
      if (missing.length > 0) {
        normalized[i] = missing.shift();
      }
    } else {
      seen.add(d);
    }
  }

  // Final pass - ensure all 10 unique digits
  const finalSeen = new Set();
  for (let i = 0; i < 10; i++) {
    if (finalSeen.has(normalized[i])) {
      // Still have a duplicate - find any remaining missing digit
      for (let d = 0; d < 10; d++) {
        if (!finalSeen.has(d)) {
          normalized[i] = d;
          break;
        }
      }
    }
    finalSeen.add(normalized[i]);
  }

  return normalized.slice(0, 10);
}

// Main export - parse image with specified provider
async function parseImage(imageBase64, provider, apiKey) {
  switch (provider.toLowerCase()) {
    case 'gemini':
      return parseWithGemini(imageBase64, apiKey);
    case 'claude':
      return parseWithClaude(imageBase64, apiKey);
    case 'openai':
      return parseWithOpenAI(imageBase64, apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}. Use 'gemini', 'claude', or 'openai'`);
  }
}

module.exports = { parseImage };
