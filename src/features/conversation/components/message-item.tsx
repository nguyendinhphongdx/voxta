import type { ConversationMessage, MessagePart } from '../types';

function ThinkingIndicator() {
  return (
    <span className="thinking-indicator" role="status" aria-live="polite">
      <span className="sr-only">Đang suy nghĩ</span>
      {[0, 1, 2].map((index) => (
        <span key={index} className="thinking-indicator-dot" aria-hidden="true" />
      ))}
    </span>
  );
}

function PartView({ part }: { part: MessagePart }) {
  switch (part.type) {
    case 'text':
      return <p className="whitespace-pre-wrap">{part.text}</p>;
    case 'thinking':
      return (
        <details className="rounded-md border border-muted-foreground/30 bg-background/50 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Đang suy nghĩ...</summary>
          <p className="mt-1 whitespace-pre-wrap">{part.text}</p>
        </details>
      );
    case 'tool-call':
      return (
        <details className="rounded-md border border-muted-foreground/30 bg-background/50 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Dùng tool: {part.name}</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">
            {part.input === undefined ? '...' : JSON.stringify(part.input, null, 2)}
          </pre>
        </details>
      );
    case 'tool-result':
      return (
        <details className="rounded-md border border-muted-foreground/30 bg-background/50 p-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none">Kết quả tool</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(part.output, null, 2)}</pre>
        </details>
      );
  }
}

interface MessageItemProps {
  message: ConversationMessage;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`flex max-w-[80%] flex-col gap-1.5 rounded-2xl px-4 py-2 text-sm ${
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {message.parts.length === 0 && message.status === 'streaming' ? (
          <ThinkingIndicator />
        ) : (
          message.parts.map((part, i) => <PartView key={i} part={part} />)
        )}
      </div>
    </div>
  );
}
