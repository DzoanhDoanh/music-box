import { describe, expect, it } from 'vitest';
import { cardNumeral, deck, DECK_SIZE } from '../../src/shared/tarot/deck';
import { interpret, readFlow, spreads, tarotCommandSchema } from '../../src/shared/tarot/contracts';

describe('Tarot deck', () => {
  it('has 78 cards with stable ids: 22 majors, then 14 per suit', () => {
    expect(deck).toHaveLength(DECK_SIZE);
    deck.forEach((card, i) => expect(card.id).toBe(i));
    expect(deck.filter((c) => c.arcana === 'MAJOR')).toHaveLength(22);
    for (const suit of ['WANDS', 'CUPS', 'SWORDS', 'PENTACLES'])
      expect(deck.filter((c) => c.suit === suit)).toHaveLength(14);
    expect(new Set(deck.map((c) => c.name)).size).toBe(78);
    expect(deck[0].name).toBe('Kẻ Khờ');
    expect(deck[21].name).toBe('Thế Giới');
    expect(deck[22].name).toBe('Át Gậy');
    expect(deck[77].name).toBe('Vua Tiền');
    for (const card of deck)
      for (const text of [
        card.upright,
        card.reversed,
        card.keywords.upright,
        card.keywords.reversed,
      ])
        expect(text.length).toBeGreaterThan(5);
  });
  it('labels majors with Roman numerals and minors with ranks', () => {
    expect(cardNumeral(deck[0])).toBe('0');
    expect(cardNumeral(deck[13])).toBe('XIII');
    expect(cardNumeral(deck[22])).toBe('A');
    expect(cardNumeral(deck[35])).toBe('K');
  });
});

describe('Tarot commands', () => {
  const base = { action: 'draw', spread: 'THREE', topic: 'GENERAL', question: '' } as const;
  it('accepts a trimmed question and an empty one for open spreads', () => {
    expect(tarotCommandSchema.parse({ ...base, question: '  Sắp tới thế nào?  ' }).question).toBe(
      'Sắp tới thế nào?',
    );
    expect(tarotCommandSchema.safeParse(base).success).toBe(true);
  });
  it('rejects unknown fields, long or control-character questions and a yes/no without question', () => {
    for (const bad of [
      { ...base, cards: [1] },
      { ...base, spread: 'CELTIC' },
      { ...base, question: 'x'.repeat(201) },
      { ...base, question: 'a\u0007b' },
      { ...base, spread: 'YES_NO' },
    ])
      expect(tarotCommandSchema.safeParse(bad).success).toBe(false);
    expect(
      tarotCommandSchema.safeParse({ ...base, spread: 'YES_NO', question: 'Có nên?' }).success,
    ).toBe(true);
  });
});

describe('Tarot interpretation', () => {
  it('maps each card to its position, orientation and topic advice', () => {
    const result = interpret({
      spread: 'THREE',
      topic: 'LOVE',
      cards: [
        { card: 0, reversed: false },
        { card: 37, reversed: true },
        { card: 19, reversed: false },
      ],
    });
    expect(result.lines.map((l) => l.position)).toEqual([...spreads.THREE.positions]);
    expect(result.lines[1].card.name).toBe('2 Cốc');
    expect(result.lines[1].meaning).toBe(deck[37].reversed);
    expect(result.lines[0].advice).toMatch(/tình cảm/i);
    expect(result.answer).toBeNull();
    expect(result.summary).toMatch(/Phần lớn các lá xuôi/);
    expect(result.summary).toMatch(/Ẩn chính/);
  });
  it('answers yes/no from the orientation and leaves general readings without advice', () => {
    const yes = interpret({
      spread: 'YES_NO',
      topic: 'GENERAL',
      cards: [{ card: 19, reversed: false }],
    });
    expect(yes.answer).toBe('Có, rất rõ');
    expect(yes.lines[0].advice).toBeNull();
    expect(
      interpret({ spread: 'YES_NO', topic: 'WORK', cards: [{ card: 40, reversed: false }] }).answer,
    ).toBe('Có');
    expect(
      interpret({ spread: 'YES_NO', topic: 'WORK', cards: [{ card: 40, reversed: true }] }).answer,
    ).toBe('Chưa phải lúc');
  });
  it('reads a three-card yes/no from the centre card and its suit', () => {
    const ask = (center: number, reversed = false) =>
      interpret({
        spread: 'YES_NO',
        topic: 'GENERAL',
        cards: [
          { card: 19, reversed: false },
          { card: center, reversed },
          { card: 17, reversed: false },
        ],
      });
    expect(ask(22).answer).toBe('Có, nếu bạn nỗ lực'); // Át Gậy
    expect(ask(36).answer).toBe('Có'); // Át Cốc
    expect(ask(64).answer).toBe('Có, nhưng phải đánh đổi'); // Át Tiền
    expect(ask(50).answer).toBe('Không'); // Át Kiếm
    expect(ask(21).answer).toBe('Có, rất rõ');
    expect(ask(36, true).answer).toBe('Chưa phải lúc');
    expect(ask(36).summary).toMatch(/Hai lá hai bên đều ủng hộ/);
    expect(ask(36).lines.map((l) => l.position)).toEqual([...spreads.YES_NO.positions]);
  });
  it('names how a three-card spread moves', () => {
    expect(readFlow([-2, 0, 2]).name).toBe('Chuyển hóa tích cực');
    expect(readFlow([2, -1, -2]).name).toBe('Chuyển hóa tiêu cực');
    expect(readFlow([1, 1, 2]).name).toBe('Tăng trưởng');
    expect(readFlow([2, 1, 0]).name).toBe('Thụt lùi');
    expect(readFlow([0, 0, 0]).name).toBe('Đứng yên');
    const reading = interpret({
      spread: 'THREE',
      topic: 'GENERAL',
      cards: [
        { card: 40, reversed: false }, // 5 Cốc, heavy
        { card: 55, reversed: false },
        { card: 17, reversed: false }, // Ngôi Sao, bright
      ],
    });
    expect(reading.flow?.name).toBe('Chuyển hóa tích cực');
  });
});

describe('Tarot AI text', () => {
  it('splits headings and paragraphs and keeps only bold as markup', async () => {
    const { aiBlocks } = await import('../../src/client/components/tarot/TarotAiText');
    expect(
      aiBlocks('## Mở đầu\nDòng một\ndòng hai\n\n- Ý **chính**\n### Lá 1: **Kẻ Khờ**\n<b>x</b>'),
    ).toEqual([
      { kind: 'h', text: 'Mở đầu' },
      { kind: 'p', text: 'Dòng một dòng hai' },
      { kind: 'p', text: 'Ý **chính**' },
      { kind: 'h', text: 'Lá 1: Kẻ Khờ' },
      { kind: 'p', text: '<b>x</b>' },
    ]);
  });
  it('builds a prompt with every card, its position and the settled yes/no answer', async () => {
    const { tarotPrompt } = await import('../../src/server/services/tarot-ai');
    const prompt = tarotPrompt({
      id: 'r',
      actor: 'a',
      actor_name: 'An',
      spread: 'YES_NO',
      topic: 'WORK',
      question: 'Có nên đổi việc?',
      cards: [
        { card: 19, reversed: false },
        { card: 64, reversed: false },
        { card: 17, reversed: false },
      ],
      created_at: '',
      reveal_at: '',
    });
    for (const text of [
      'Công việc',
      '"""Có nên đổi việc?"""',
      'Vị trí "Câu trả lời"',
      'XUÔI',
      'Câu trả lời Có/Không đã xác định: Có, nhưng phải đánh đổi.',
    ])
      expect(prompt).toContain(text);
    expect(prompt).not.toMatch(/\n\n\n/);
  });
});
