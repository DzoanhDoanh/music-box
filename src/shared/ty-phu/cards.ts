// Chance deck: 15 cards, each with its own mechanic (docs/TY_PHU_GAME_DESIGN.md).

export const cardIds = [
  'STORM',
  'DEMOLISH',
  'EVICT',
  'BLACKOUT',
  'GIFT',
  'JAIL',
  'DOUBLE_FINE',
  'BIRTHDAY',
  'HALF_PRICE',
  'JAIL_PASS',
  'SHIELD',
  'GO_FESTIVAL',
  'HOST_FESTIVAL',
  'GO_AIRPORT',
  'GO_START',
] as const;
export type CardId = (typeof cardIds)[number];

/** Cards that need the drawer to pick a target before they resolve. */
export type CardTarget = 'OPPONENT_CITY' | 'OWN_CITY_AND_PLAYER' | 'OWN_CITY' | null;
export type CardKind = 'ATTACK' | 'BAD' | 'GOOD';

export const cards: Record<
  CardId,
  { name: string; kind: CardKind; target: CardTarget; text: string; held?: true }
> = {
  STORM: {
    name: 'Bão quét qua sân khấu',
    kind: 'ATTACK',
    target: 'OPPONENT_CITY',
    text: 'Hạ 1 cấp một thành phố của đối thủ.',
  },
  DEMOLISH: {
    name: 'Phá dỡ công trình trái phép',
    kind: 'ATTACK',
    target: 'OPPONENT_CITY',
    text: 'Xóa sạch nhà trên một thành phố của đối thủ, chủ vẫn giữ đất.',
  },
  EVICT: {
    name: 'Thu hồi mặt bằng',
    kind: 'ATTACK',
    target: 'OPPONENT_CITY',
    text: 'Xóa sổ một thành phố của đối thủ, cả nhà lẫn đất. Chủ không nhận lại gì, ô thành đất trống.',
  },
  BLACKOUT: {
    name: 'Mất điện toàn khu',
    kind: 'ATTACK',
    target: 'OPPONENT_CITY',
    text: 'Một thành phố của đối thủ không thu tiền thuê trong 2 lượt kế tiếp của chủ.',
  },
  GIFT: {
    name: 'Quà tri ân khán giả',
    kind: 'BAD',
    target: 'OWN_CITY_AND_PLAYER',
    text: 'Tặng một thành phố của bạn cho người chơi bạn chọn.',
  },
  JAIL: { name: 'Gây ồn sau 22 giờ', kind: 'BAD', target: null, text: 'Vào tù ngay.' },
  DOUBLE_FINE: {
    name: 'Bị phạt gấp đôi',
    kind: 'BAD',
    target: null,
    text: 'Lần trả tiền thuê hoặc thuế kế tiếp bị nhân đôi.',
  },
  BIRTHDAY: {
    name: 'Sinh nhật của bạn',
    kind: 'GOOD',
    target: null,
    text: 'Mỗi người chơi khác tặng bạn 50.',
  },
  HALF_PRICE: {
    name: 'Phiếu giảm giá nửa vé',
    kind: 'GOOD',
    target: null,
    text: 'Lần trả tiền thuê hoặc thuế kế tiếp chỉ trả 50%.',
    held: true,
  },
  JAIL_PASS: {
    name: 'Thẻ VIP hậu trường',
    kind: 'GOOD',
    target: null,
    text: 'Giữ lại để ra tù ngay.',
    held: true,
  },
  SHIELD: {
    name: 'Bảo hiểm sân khấu',
    kind: 'GOOD',
    target: null,
    text: 'Tự động chặn phiếu tấn công đầu tiên nhắm vào bạn.',
    held: true,
  },
  GO_FESTIVAL: {
    name: 'Mua được vé Đại nhạc hội',
    kind: 'GOOD',
    target: null,
    text: 'Đi tới nơi đang tổ chức Đại nhạc hội.',
  },
  HOST_FESTIVAL: {
    name: 'Được chọn đăng cai',
    kind: 'GOOD',
    target: 'OWN_CITY',
    text: 'Chọn một thành phố của bạn tổ chức Đại nhạc hội.',
  },
  GO_AIRPORT: {
    name: 'Vé máy bay giá rẻ',
    kind: 'GOOD',
    target: null,
    text: 'Đi thẳng tới Sân bay, lượt sau bay miễn phí.',
  },
  GO_START: {
    name: 'Về nhà ăn Tết',
    kind: 'GOOD',
    target: null,
    text: 'Về Xuất phát, nhận lương và được xây thêm 1 cấp.',
  },
};
