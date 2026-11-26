import { z } from 'zod';
import { deck, suits, type TarotCard } from './deck';

export const spreads = {
  ONE: { label: '1 lá', hint: 'Thông điệp cho hôm nay', positions: ['Thông điệp'] },
  THREE: {
    label: '3 lá',
    hint: 'Quá khứ, hiện tại, tương lai',
    positions: ['Quá khứ', 'Hiện tại', 'Tương lai'],
  },
  YES_NO: { label: 'Có / Không', hint: 'Một câu hỏi, một lá trả lời', positions: ['Câu trả lời'] },
} as const;
export type TarotSpread = keyof typeof spreads;
export const topics = {
  GENERAL: 'Chung',
  LOVE: 'Tình cảm',
  WORK: 'Công việc',
  MONEY: 'Tài chính',
} as const;
export type TarotTopic = keyof typeof topics;
/** Each person may draw again this long after their previous reading in the room. */
export const TAROT_COOLDOWN_SECONDS = 20;
export const QUESTION_MAX = 200;
/** Shuffle time before the first card turns, then one card every FLIP_MS (the database uses the same numbers). */
export const TAROT_SHUFFLE_MS = 1500;
export const TAROT_FLIP_MS = 900;

export const tarotCommandSchema = z
  .object({
    action: z.literal('draw'),
    spread: z.enum(['ONE', 'THREE', 'YES_NO']),
    topic: z.enum(['GENERAL', 'LOVE', 'WORK', 'MONEY']),
    question: z
      .string()
      .trim()
      .max(QUESTION_MAX, `Câu hỏi tối đa ${QUESTION_MAX} ký tự.`)
      .refine(
        (text) => [...text].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
        'Câu hỏi có ký tự không hợp lệ.',
      ),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.spread === 'YES_NO' && !value.question)
      ctx.addIssue({
        code: 'custom',
        path: ['question'],
        message: 'Trải bài Có / Không cần một câu hỏi.',
      });
  });
export type TarotCommand = z.infer<typeof tarotCommandSchema>;

export interface TarotDrawnCard {
  card: number;
  reversed: boolean;
}
export interface TarotReading {
  id: string;
  actor: string;
  actor_name: string;
  spread: TarotSpread;
  topic: TarotTopic;
  question: string;
  cards: TarotDrawnCard[];
  created_at: string;
  /** All viewers flip the cards together; the last card is face up at this moment. */
  reveal_at: string;
}
export interface TarotSnapshot {
  server_time: string;
  latest: TarotReading | null;
  recent: TarotReading[];
  /** When the viewer may draw again; null when they can draw now. */
  my_next_at: string | null;
}

// ---------------------------------------------------------------- interpretation

type Source = 'MAJOR' | keyof typeof suits;
const topicAdvice: Record<Exclude<TarotTopic, 'GENERAL'>, Record<Source, [string, string]>> = {
  LOVE: {
    MAJOR: [
      'Trong tình cảm, đây là một bước ngoặt đáng kể. Hãy thành thật với cảm xúc của mình.',
      'Trong tình cảm, có bài học lớn cần nhìn lại trước khi tiến xa hơn.',
    ],
    WANDS: [
      'Tình cảm đang nồng nhiệt. Chủ động bày tỏ sẽ được đáp lại.',
      'Lửa tình cảm đang lúc tắt lúc bùng. Đừng để nóng giận nói thay mình.',
    ],
    CUPS: [
      'Trái tim đang rộng mở, rất hợp để vun đắp hoặc bắt đầu một mối quan hệ.',
      'Cảm xúc đang chòng chành. Cho nhau thời gian và lắng nghe nhiều hơn.',
    ],
    SWORDS: [
      'Nói chuyện rõ ràng sẽ gỡ được khúc mắc trong mối quan hệ.',
      'Lời nói dễ làm tổn thương lúc này. Chọn từ ngữ thật cẩn thận.',
    ],
    PENTACLES: [
      'Tình cảm bền vững nhờ sự quan tâm thiết thực mỗi ngày.',
      'Chuyện thực tế (tiền bạc, thời gian) đang gây áp lực lên tình cảm.',
    ],
  },
  WORK: {
    MAJOR: [
      'Trong công việc, một giai đoạn quan trọng đang mở ra. Nắm lấy vai trò của mình.',
      'Trong công việc, cần xem lại hướng đi lớn trước khi tăng tốc.',
    ],
    WANDS: [
      'Công việc có đà tốt. Lúc thích hợp để đề xuất ý tưởng hoặc nhận dự án mới.',
      'Năng lượng làm việc đang bị phân tán. Tập trung vào một mục tiêu chính.',
    ],
    CUPS: [
      'Không khí làm việc dễ chịu, các mối quan hệ đồng nghiệp hỗ trợ bạn.',
      'Cảm xúc đang ảnh hưởng tới công việc. Tách bạch hai chuyện sẽ dễ thở hơn.',
    ],
    SWORDS: [
      'Tư duy sắc bén giúp bạn giải quyết vấn đề khó. Hãy phân tích kỹ.',
      'Căng thẳng hoặc bất đồng nơi làm việc. Giữ bình tĩnh và minh bạch.',
    ],
    PENTACLES: [
      'Sự chăm chỉ và tỉ mỉ sẽ được ghi nhận bằng kết quả cụ thể.',
      'Công việc đang chậm hoặc chưa tương xứng công sức. Kiên nhẫn và điều chỉnh cách làm.',
    ],
  },
  MONEY: {
    MAJOR: [
      'Về tài chính, có thay đổi lớn. Lên kế hoạch trước khi quyết định.',
      'Về tài chính, đừng đưa ra quyết định lớn khi chưa hiểu hết rủi ro.',
    ],
    WANDS: [
      'Có cơ hội kiếm thêm từ việc chủ động và sáng tạo.',
      'Coi chừng chi tiêu bốc đồng theo cảm hứng.',
    ],
    CUPS: [
      'Tiền bạc đủ đầy để chia sẻ và tận hưởng cùng người thân.',
      'Đừng để cảm xúc quyết định chuyện tiền nong.',
    ],
    SWORDS: [
      'Tính toán rõ ràng, đọc kỹ điều khoản sẽ giúp bạn tránh thiệt.',
      'Lo lắng về tiền đang làm bạn rối. Viết ra từng khoản sẽ nhẹ đầu hơn.',
    ],
    PENTACLES: [
      'Tài chính ổn định. Tích lũy đều đặn sẽ sinh quả ngọt.',
      'Cần thắt chặt chi tiêu và xem lại các khoản đầu tư.',
    ],
  },
};

export interface TarotLine {
  position: string;
  card: TarotCard;
  reversed: boolean;
  meaning: string;
  advice: string | null;
}
export interface TarotInterpretation {
  lines: TarotLine[];
  /** Yes/no answer, only for the YES_NO spread. */
  answer: string | null;
  summary: string;
}

export function interpret(reading: Pick<TarotReading, 'spread' | 'topic' | 'cards'>) {
  const positions = spreads[reading.spread].positions;
  const lines: TarotLine[] = reading.cards.map(({ card, reversed }, i) => {
    const c = deck[card];
    const source: Source = c.suit ?? 'MAJOR';
    return {
      position: positions[i] ?? `Lá ${i + 1}`,
      card: c,
      reversed,
      meaning: reversed ? c.reversed : c.upright,
      advice: reading.topic === 'GENERAL' ? null : topicAdvice[reading.topic][source][+reversed],
    };
  });
  let answer: string | null = null;
  if (reading.spread === 'YES_NO')
    answer = lines[0]?.reversed
      ? 'Chưa phải lúc'
      : lines[0]?.card.arcana === 'MAJOR'
        ? 'Có, rất rõ'
        : 'Có';
  const upright = lines.filter((l) => !l.reversed).length;
  const majorsDrawn = lines.filter((l) => l.card.arcana === 'MAJOR').length;
  const parts: string[] = [];
  if (lines.length > 1) {
    parts.push(
      upright === lines.length
        ? 'Tất cả các lá đều xuôi: dòng chảy đang thuận, cứ tự tin tiến lên.'
        : upright === 0
          ? 'Tất cả các lá đều ngược: nhiều điều cần nhìn lại trước khi đi tiếp.'
          : upright > lines.length / 2
            ? 'Phần lớn các lá xuôi: tình hình nhìn chung thuận lợi.'
            : 'Phần lớn các lá ngược: chậm lại và gỡ từng nút thắt.',
    );
    if (majorsDrawn >= 2) parts.push('Nhiều lá Ẩn chính: đây là giai đoạn mang tính bước ngoặt.');
    const counts = new Map<string, number>();
    for (const l of lines)
      if (l.card.suit) counts.set(l.card.suit, (counts.get(l.card.suit) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (top && top[1] >= 2)
      parts.push(
        `Nhiều lá ${suits[top[0] as keyof typeof suits].name}: ${suits[top[0] as keyof typeof suits].element}.`,
      );
  } else if (lines[0]) {
    parts.push(
      lines[0].reversed
        ? `${lines[0].card.name} ngược: ${lines[0].card.keywords.reversed.toLocaleLowerCase('vi')}.`
        : `${lines[0].card.name}: ${lines[0].card.keywords.upright.toLocaleLowerCase('vi')}.`,
    );
  }
  return { lines, answer, summary: parts.join(' ') } satisfies TarotInterpretation;
}
