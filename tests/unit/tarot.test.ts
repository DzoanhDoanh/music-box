import { describe, expect, it } from 'vitest';
import { cardNumeral, deck, DECK_SIZE } from '../../src/shared/tarot/deck';
import { interpret, spreads, tarotCommandSchema } from '../../src/shared/tarot/contracts';

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
});
