/**
 * Live AI Chatbot — Server
 * 
 * Architecture:
 *   Express serves the frontend; Socket.io handles real-time bidirectional
 *   communication. Each connected client receives a unique session ID and
 *   an isolated in-memory conversation history. Messages are streamed token-
 *   by-token from the OpenAI API back to the originating client only.
 * 
 * Security:
 *   - Inputs are trimmed and validated before processing.
 *   - Session data is never shared between sockets.
 *   - Rate-limiting prevents abuse per session.
 *   - API keys live in environment variables only.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const OpenAI = require('openai');
const path = require('path');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env.PORT, 10) || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_TOKENS = parseInt(process.env.MAX_TOKENS, 10) || 1024;
const MAX_CONTEXT_TOKENS = parseInt(process.env.MAX_CONTEXT_TOKENS, 10) || 4096;
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE, 10) || 20;

// ---------------------------------------------------------------------------
// Express + Socket.io setup
// ---------------------------------------------------------------------------

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ORIGIN, methods: ['GET', 'POST'] },
  pingInterval: 10000,   // how often the server pings clients
  pingTimeout: 5000,     // how long to wait before considering client disconnected
});

// ---------------------------------------------------------------------------
// OpenAI client + startup validation
// ---------------------------------------------------------------------------

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.error('\n  ❌  OPENAI_API_KEY is not set in .env file.\n');
  console.error('  Copy .env.example to .env and add your key:');
  console.error('  OPENAI_API_KEY=sk-...\n');
  process.exit(1);
}

if (API_KEY === 'sk-your-api-key-here' || API_KEY === 'gsk_your_groq_api_key_here') {
  console.error('\n  ❌  OPENAI_API_KEY is still set to the placeholder value.\n');
  console.error('  Replace it with a real key from your provider.\n');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: API_KEY,
  baseURL: OPENAI_BASE_URL,
  maxRetries: 2,
});

// Test the API key with a lightweight call at startup
async function verifyApiKey() {
  try {
    await openai.models.list();
    console.log('  ✅  OpenAI API key is valid');
  } catch (err) {
    const status = err.status || err.code;
    console.error(`\n  ❌  OpenAI API key verification failed (${status}): ${err.message}\n`);
    if (err.status === 401) {
      console.error('  → The API key is invalid or has been revoked.');
      console.error('  → Generate a new key at https://platform.openai.com/api-keys\n');
    } else if (err.status === 429) {
      console.error('  → Your OpenAI account has exceeded its quota or is rate-limited.');
      console.error('  → Check your usage & billing at https://platform.openai.com/usage\n');
    }
    console.error('  The server will start, but AI requests will fail until this is resolved.\n');
  }
}

// ---------------------------------------------------------------------------
// In-memory session store
// Maps sessionId -> { messages: [], rateLimit: { windowStart, count } }
// ---------------------------------------------------------------------------

const sessions = new Map();

/**
 * Create or retrieve a session container.
 * @param {string} sessionId
 * @returns {{ messages: Array, rateLimit: { windowStart: number, count: number } }}
 */
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      messages: [],
      rateLimit: { windowStart: Date.now(), count: 0 },
    });
  }
  return sessions.get(sessionId);
}

/**
 * Remove a session and its message history.
 * @param {string} sessionId
 */
function destroySession(sessionId) {
  sessions.delete(sessionId);
}

/**
 * Check and increment the rate-limit for a session.
 * Returns true if the message is allowed, false if rate-limited.
 * @param {{ rateLimit: { windowStart: number, count: number } }} session
 * @returns {boolean}
 */
function checkRateLimit(session) {
  const now = Date.now();
  const windowMs = 60_000; // 1 minute

  if (now - session.rateLimit.windowStart > windowMs) {
    // Reset window
    session.rateLimit.windowStart = now;
    session.rateLimit.count = 0;
  }

  session.rateLimit.count += 1;
  return session.rateLimit.count <= RATE_LIMIT_PER_MINUTE;
}

/**
 * Rough token estimation (4 chars ≈ 1 token). Used to keep conversation
 * history within the model's context window.
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Trim old messages when the conversation exceeds MAX_CONTEXT_TOKENS.
 * @param {Array} messages - conversation history
 * @param {string} systemPrompt - the system prompt (counted in the budget)
 */
function trimHistory(messages, systemPrompt) {
  // Reserve tokens for the system prompt
  const systemTokens = estimateTokens(systemPrompt || '');
  const budget = MAX_CONTEXT_TOKENS - systemTokens;
  if (budget <= 0) return;

  let total = 0;
  let trimIndex = -1;
  // Count from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    total += estimateTokens(messages[i].content);
    if (total > budget) {
      trimIndex = i;
      break;
    }
  }
  if (trimIndex > 0) {
    const dropped = trimIndex + 1;
    // Always keep at least the most recent 2 messages (last exchange)
    const keep = Math.min(dropped, Math.max(0, messages.length - 2));
    if (keep > 0) {
      messages.splice(0, keep);
      console.log(`  trimmed ${keep} old message(s) to stay within context limit`);
    }
  }
}

// ---------------------------------------------------------------------------
// Socket.io event handlers
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
  // Each socket gets a globally unique session ID
  const sessionId = uuidv4();
  let systemContext = '';

  console.log(`[connect]   socket=${socket.id}  session=${sessionId}`);

  // Initialise the in-memory session
  getSession(sessionId);

  // -----------------------------------------------------------------------
  // Tell the client its session ID
  // -----------------------------------------------------------------------
  socket.emit('session', { sessionId });

  // -----------------------------------------------------------------------
  // Allow the client to set a custom system-prompt context
  // -----------------------------------------------------------------------
  socket.on('set context', ({ context }) => {
    if (context && typeof context === 'string') {
      systemContext = context.trim();
      console.log(`[context]   session=${sessionId}  context="${systemContext}"`);
    }
  });

  // -----------------------------------------------------------------------
  // Handle an incoming chat message
  // -----------------------------------------------------------------------
  socket.on('chat message', async ({ content } = {}) => {
    // --- Validation ---
    if (!content || typeof content !== 'string') {
      socket.emit('chat error', { message: 'Message must be a non-empty string.' });
      return;
    }

    const trimmed = content.trim();
    if (!trimmed) {
      socket.emit('chat error', { message: 'Message cannot be empty.' });
      return;
    }

    const session = getSession(sessionId);

    // --- Rate limit ---
    if (!checkRateLimit(session)) {
      socket.emit('chat error', {
        message: `You are sending messages too quickly. Please wait before sending another message. (limit: ${RATE_LIMIT_PER_MINUTE}/minute)`,
      });
      return;
    }

    // --- Store user message ---
    const userMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    session.messages.push(userMessage);

    // Echo back to sender so the UI can render it
    socket.emit('user message echo', userMessage);

    // ------------------------------------------------------------------
    // Build system prompt, then trim history to stay within context window
    // ------------------------------------------------------------------
    const systemPrompt = systemContext
      ? `You are a helpful, accurate AI assistant. Follow the user's context instructions carefully.\n\nContext: ${systemContext}`
      : 'You are a helpful, accurate, and concise AI assistant.';

    trimHistory(session.messages, systemPrompt);

    const messagesForLLM = [
      { role: 'system', content: systemPrompt },
      ...session.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    // ------------------------------------------------------------------
    // Stream the response from OpenAI
    // ------------------------------------------------------------------
    try {
      socket.emit('chat response start');

      const stream = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messagesForLLM,
        stream: true,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullResponse += token;
          socket.emit('chat response chunk', { chunk: token });
        }
      }

      // --- Store assistant message ---
      const assistantMessage = {
        role: 'assistant',
        content: fullResponse,
        timestamp: new Date().toISOString(),
      };
      session.messages.push(assistantMessage);

      socket.emit('chat response end', {
        fullContent: fullResponse,
        timestamp: assistantMessage.timestamp,
      });

      console.log(
        `[response]  session=${sessionId}  tokens=${fullResponse.length}  history=${session.messages.length} msgs`
      );
    } catch (err) {
      // Log the full error details server-side for debugging
      console.error(`[error]     session=${sessionId}`);
      console.error(`  message:  ${err.message}`);
      console.error(`  status:   ${err.status}`);
      console.error(`  code:     ${err.code}`);
      console.error(`  type:     ${err.type}`);

      let userMessage = 'Sorry, something went wrong while processing your message.';

      if (err.status === 401) {
        userMessage = 'Authentication failed. The API key is invalid or has been revoked.';
      } else if (err.status === 429 && err.code === 'insufficient_quota') {
        userMessage = 'Your OpenAI account has run out of credits. Please check your billing plan at https://platform.openai.com/account/billing';
      } else if (err.status === 429) {
        userMessage = 'The AI service is temporarily rate-limited. Please wait a moment and try again.';
      } else if (err.status === 400) {
        userMessage = 'Invalid request. The server console has more details — please share the error output.';
      } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        userMessage = 'Could not reach the AI service. Please check your internet connection.';
      }

      socket.emit('chat error', { message: userMessage });

      // Remove the user message so the conversation stays clean for retry
      session.messages.pop();
    }
  });

  // -----------------------------------------------------------------------
  // Cleanup on disconnect
  // -----------------------------------------------------------------------
  socket.on('disconnect', () => {
    console.log(`[disconnect] socket=${socket.id}  session=${sessionId}`);

    // Keep the session in memory for 5 minutes in case the client reconnects
    // with the same session ID (requires client-side session persistence).
    // For now we simply clean up immediately to keep memory lean.
    destroySession(sessionId);
  });
});

// ---------------------------------------------------------------------------
// Health-check endpoint
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeSessions: sessions.size,
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n  Live AI Chatbot — http://localhost:${PORT}\n`);
  console.log(`  API URL:    ${OPENAI_BASE_URL}`);
  console.log(`  Model:      ${OPENAI_MODEL}`);
  console.log(`  Max tokens: ${MAX_TOKENS}`);
  console.log(`  Rate limit: ${RATE_LIMIT_PER_MINUTE} msg/min/session`);
  console.log(`  CORS:       ${CORS_ORIGIN}\n`);

  // Verify the API key asynchronously (doesn't block startup)
  verifyApiKey();
});
