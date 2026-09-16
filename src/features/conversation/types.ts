/** Message có cấu trúc dùng cho Conversation view — độc lập với voice pipeline (Live). Cả chế độ
 * gõ text (`agent-session.ts`) lẫn chế độ Live (`features/call/store.ts` forward `transcript-delta`
 * qua đây) đều ghi vào cùng 1 `useConversationStore`, nên UI không cần biết message tới từ đâu. */

export type MessageRole = 'user' | 'assistant';

export type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; output: unknown };

export interface ConversationMessage {
  id: string;
  role: MessageRole;
  parts: MessagePart[];
  /** 'streaming' trong lúc còn chờ delta tiếp theo — UI hiện "..." nếu parts rỗng. */
  status: 'streaming' | 'done';
  createdAt: number;
}
