import { useState, type ReactNode } from 'react';
import { BookOpen, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import {
  TAROT_AI_MAX_ATTEMPTS,
  TAROT_AI_STALE_MS,
  type TarotReading,
} from '../../../shared/tarot/contracts';
import { api } from '../../lib/api';
import { Button } from '../ui';

// Only **bold** is honoured; everything else is plain text, so model output can never become markup.
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*\n]+\*\*)/g)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part.replace(/\*\*/g, '')
      ),
    );
}

/** Split the AI text into headings ("## …") and paragraphs. */
export function aiBlocks(text: string) {
  const blocks: { kind: 'h' | 'p'; text: string }[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const heading = /^#{1,4}\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: 'h', text: heading[1].replace(/\*\*/g, '').trim() });
    } else if (!line) flush();
    else paragraph.push(line.replace(/^[-*•]\s+/, ''));
  }
  flush();
  return blocks;
}

export function TarotAiText({
  reading,
  room,
  me,
  now,
  onChange,
}: {
  reading: TarotReading;
  room: string;
  me: string;
  /** Server-adjusted clock, used to notice a reading that was never finished. */
  now: number;
  onChange: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const ai = reading.ai;
  if (!ai) return null;
  const lost = ai.status === 'pending' && now - Date.parse(ai.at) > TAROT_AI_STALE_MS;
  if (ai.status === 'pending' && !lost)
    return (
      <section className="tarot-ai pending" role="status" aria-label="Đang luận giải chi tiết">
        <h3>
          <BookOpen size={17} aria-hidden="true" /> Đang luận giải chi tiết…
        </h3>
        <span className="tarot-ai-line" />
        <span className="tarot-ai-line" />
        <span className="tarot-ai-line short" />
      </section>
    );
  if (ai.status === 'done' && ai.text)
    return (
      <section className="tarot-ai" aria-labelledby={`ai-${reading.id}`}>
        <h3 id={`ai-${reading.id}`}>
          <BookOpen size={17} aria-hidden="true" /> Luận giải chi tiết
        </h3>
        {aiBlocks(ai.text).map((block, i) =>
          block.kind === 'h' ? <h4 key={i}>{block.text}</h4> : <p key={i}>{inline(block.text)}</p>,
        )}
      </section>
    );
  const canRetry = reading.actor === me && ai.attempts < TAROT_AI_MAX_ATTEMPTS;
  async function retry() {
    setAsking(true);
    try {
      await api(`/rooms/${room}/tarot/${reading.id}/ai`, {}, undefined, me);
      onChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chưa gửi được yêu cầu.');
    } finally {
      setAsking(false);
    }
  }
  return (
    <section className="tarot-ai failed">
      <p>Chưa viết được phần luận giải chi tiết. Phần ý nghĩa từng lá bên dưới vẫn đầy đủ.</p>
      {canRetry && (
        <Button onClick={retry} disabled={asking}>
          <RotateCcw size={15} aria-hidden="true" /> {asking ? 'Đang gửi…' : 'Luận giải lại'}
        </Button>
      )}
    </section>
  );
}
