import { z } from 'zod';
export const wheelRewards = {
  NONE: {
    label: 'Không có phần thưởng',
    description: 'Chỉ chọn ngẫu nhiên, không thay đổi hàng chờ.',
  },
  LATEST_FIRST: {
    label: 'Ưu tiên 1 bài gần nhất',
    description: 'Bài đang chờ mới nhất của người trúng được phát kế tiếp.',
  },
  TWO_FIRST: {
    label: 'Ưu tiên 2 bài gần nhất',
    description: 'Tối đa hai bài đang chờ mới nhất của người trúng lên đầu hàng chờ.',
  },
} as const;
export type WheelReward = keyof typeof wheelRewards;
export const wheelCommandSchema = z
  .object({
    action: z.literal('spin'),
    mode: z.enum(['MEMBERS', 'CUSTOM']),
    reward: z.enum(['NONE', 'LATEST_FIRST', 'TWO_FIRST']),
    labels: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(60)
          .refine((text) => [...text].every((character) => character.charCodeAt(0) >= 32)),
      )
      .max(50),
    previous_id: z.uuid().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'MEMBERS' && value.labels.length)
      ctx.addIssue({
        code: 'custom',
        path: ['labels'],
        message: 'Danh sách thành viên do máy chủ xác định.',
      });
    if (value.mode === 'CUSTOM') {
      if (value.reward !== 'NONE')
        ctx.addIssue({
          code: 'custom',
          path: ['reward'],
          message: 'Danh sách tự nhập không có thưởng nhạc.',
        });
      if (
        value.labels.length < 2 ||
        new Set(value.labels.map((text) => text.toLocaleLowerCase('vi'))).size !==
          value.labels.length
      )
        ctx.addIssue({
          code: 'custom',
          path: ['labels'],
          message: 'Nhập 2–50 lựa chọn khác nhau, mỗi dòng một lựa chọn.',
        });
    }
  });
export type WheelCommand = z.infer<typeof wheelCommandSchema>;
export interface WheelChoice {
  id: string;
  label: string;
}
export interface WheelResult {
  id: string;
  mode: 'MEMBERS' | 'CUSTOM';
  reward: WheelReward;
  choices: WheelChoice[];
  winner_index: number;
  winner: WheelChoice;
  actor: string;
  created_at: string;
  reveal_at: string;
  next_spin_at: string;
  rewarded: { id: string; title: string }[];
}
export interface WheelSnapshot {
  server_time: string;
  online: (WheelChoice & { queued: number })[];
  latest: WheelResult | null;
  recent: WheelResult[];
}
