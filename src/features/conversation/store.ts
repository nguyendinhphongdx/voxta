import { create } from 'zustand';

import type { ConversationMessage } from './types';

interface ConversationStore {
  messages: ConversationMessage[];
  addUserMessage: (text: string) => string;
  startAssistantMessage: () => string;
  appendText: (messageId: string, delta: string) => void;
  appendThinking: (messageId: string, delta: string) => void;
  addToolCall: (messageId: string, toolCallId: string, name: string) => void;
  setToolCallInput: (messageId: string, toolCallId: string, input: unknown) => void;
  addToolResult: (messageId: string, toolCallId: string, output: unknown) => void;
  finishMessage: (messageId: string) => void;
  failMessage: (messageId: string, error: string) => void;
  clear: () => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg_${Date.now()}_${idCounter}`;
}

/** Store message dùng chung toàn app — chat gõ text (`agent-session.ts`) và Live call
 * (`features/call/store.ts`) đều ghi vào đây, Conversation view chỉ đọc từ 1 nguồn duy nhất. */
export const useConversationStore = create<ConversationStore>((set) => ({
  messages: [],

  addUserMessage: (text) => {
    const id = nextId();
    set((s) => ({
      messages: [
        ...s.messages,
        { id, role: 'user', parts: [{ type: 'text', text }], status: 'done', createdAt: Date.now() },
      ],
    }));
    return id;
  },

  startAssistantMessage: () => {
    const id = nextId();
    set((s) => ({
      messages: [...s.messages, { id, role: 'assistant', parts: [], status: 'streaming', createdAt: Date.now() }],
    }));
    return id;
  },

  // Nối delta vào part `text` CUỐI CÙNG nếu có, else mở part text mới.
  appendText: (messageId, delta) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const last = m.parts[m.parts.length - 1];
        if (last?.type === 'text') {
          const parts = [...m.parts];
          parts[parts.length - 1] = { type: 'text', text: last.text + delta };
          return { ...m, parts };
        }
        return { ...m, parts: [...m.parts, { type: 'text', text: delta }] };
      }),
    }));
  },

  // Cùng logic với `appendText` nhưng cho part `thinking` — tách riêng vì đây là loại part khác
  // (UI hiện dạng collapse, không phải câu trả lời chính).
  appendThinking: (messageId, delta) => {
    set((s) => ({
      messages: s.messages.map((m) => {
        if (m.id !== messageId) return m;
        const last = m.parts[m.parts.length - 1];
        if (last?.type === 'thinking') {
          const parts = [...m.parts];
          parts[parts.length - 1] = { type: 'thinking', text: last.text + delta };
          return { ...m, parts };
        }
        return { ...m, parts: [...m.parts, { type: 'thinking', text: delta }] };
      }),
    }));
  },

  // Tool-call luôn mở PART MỚI (không merge như text/thinking) — input tới sau qua
  // `setToolCallInput` khi Claude Code ráp xong JSON (xem ClaudeCodeConnector).
  addToolCall: (messageId, toolCallId, name) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, parts: [...m.parts, { type: 'tool-call', id: toolCallId, name, input: undefined }] }
          : m,
      ),
    }));
  },

  setToolCallInput: (messageId, toolCallId, input) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? {
              ...m,
              parts: m.parts.map((p) => (p.type === 'tool-call' && p.id === toolCallId ? { ...p, input } : p)),
            }
          : m,
      ),
    }));
  },

  // tool-result là part RIÊNG (không gộp vào tool-call) — Claude Code trả nó ở 1 dòng NDJSON khác
  // hẳn, đến sau tool-call-input, nên hiện thành 1 khối collapse "Kết quả tool" tách biệt.
  addToolResult: (messageId, toolCallId, output) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, parts: [...m.parts, { type: 'tool-result', id: toolCallId, output }] }
          : m,
      ),
    }));
  },

  finishMessage: (messageId) => {
    set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, status: 'done' } : m)) }));
  },

  failMessage: (messageId, error) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === messageId
          ? { ...m, status: 'done', parts: [...m.parts, { type: 'text', text: `⚠️ ${error}` }] }
          : m,
      ),
    }));
  },

  clear: () => set({ messages: [] }),
}));
