import { z } from 'zod';

export const heroSkins = ['HERO', 'MASKED_HERO', 'ROBOT', 'NINJA'] as const;
export type HeroSkin = (typeof heroSkins)[number];
export const pieceSkinGroups = ['Siêu anh hùng', 'Động vật', 'Biểu tượng'] as const;
export const pieceSkinSchema = z.enum([
  'HORSE',
  'CAT',
  'DOG',
  'RABBIT',
  'BIRD',
  'FISH',
  'TURTLE',
  'ROCKET',
  'CROWN',
  'GEM',
  'GHOST',
  'STAR',
  ...heroSkins,
]);
export type PieceSkin = z.infer<typeof pieceSkinSchema>;
export function isHeroSkin(skin: PieceSkin): skin is HeroSkin {
  return (heroSkins as readonly string[]).includes(skin);
}
export const pieceSkins: {
  id: PieceSkin;
  name: string;
  group: (typeof pieceSkinGroups)[number];
}[] = [
  { id: 'HERO', name: 'Siêu nhân', group: 'Siêu anh hùng' },
  { id: 'MASKED_HERO', name: 'Anh hùng mặt nạ', group: 'Siêu anh hùng' },
  { id: 'ROBOT', name: 'Robot', group: 'Siêu anh hùng' },
  { id: 'NINJA', name: 'Ninja', group: 'Siêu anh hùng' },
  { id: 'HORSE', name: 'Ngựa', group: 'Động vật' },
  { id: 'CAT', name: 'Mèo', group: 'Động vật' },
  { id: 'DOG', name: 'Chó', group: 'Động vật' },
  { id: 'RABBIT', name: 'Thỏ', group: 'Động vật' },
  { id: 'BIRD', name: 'Chim', group: 'Động vật' },
  { id: 'FISH', name: 'Cá', group: 'Động vật' },
  { id: 'TURTLE', name: 'Rùa', group: 'Động vật' },
  { id: 'ROCKET', name: 'Tên lửa', group: 'Biểu tượng' },
  { id: 'CROWN', name: 'Vương miện', group: 'Biểu tượng' },
  { id: 'GEM', name: 'Kim cương', group: 'Biểu tượng' },
  { id: 'GHOST', name: 'Ma nhỏ', group: 'Biểu tượng' },
  { id: 'STAR', name: 'Ngôi sao', group: 'Biểu tượng' },
];
export const pieceSkinName = (skin?: PieceSkin) =>
  pieceSkins.find((s) => s.id === (skin ?? 'HORSE'))!.name;
