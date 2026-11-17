import { useState } from 'react';
import { toast } from 'sonner';
import {
  settingsSchema,
  economySchema,
  type BauCommand,
  type BauSettings as Settings,
  type BauSnapshot,
} from '../../../shared/bau-cua/contracts';
import { AsyncButton, Button, Modal } from '../ui';

export const settingLabels: Record<keyof Settings, string> = {
  enabled: 'Cho phép Bầu Cua',
  capacity: 'Số người chơi mỗi bàn',
  spectators: 'Cho phép khán giả',
  autoNext: 'Tự mở vòng tiếp khi đủ người online',
  minBet: 'Cược tối thiểu',
  maxBet: 'Cược tối đa mỗi lần',
  playerLimit: 'Tổng cược mỗi người/vòng',
  tableLimit: 'Tổng cược cả bàn/vòng',
  customStake: 'Cho nhập mức cược riêng',
  undoBet: 'Cho hoàn tác trước khi khóa',
  rotateDealer: 'Luân phiên cầm cái',
  dealerRounds: 'Số vòng liên tiếp tối đa',
  dealerMinimum: 'Coin khả dụng tối thiểu để làm cái',
  disconnectPolicy: 'Khi cái rời mạng',
  bettingSeconds: 'Thời gian đặt cược (giây)',
  lockingSeconds: 'Thời gian khóa cược (giây)',
  shakingSeconds: 'Thời gian lắc (giây)',
  revealingSeconds: 'Thời gian mở bát (giây)',
  resultSeconds: 'Thời gian xem kết quả (giây)',
  penaltyEnabled: 'Bật hình phạt nhạc',
  penaltyTrigger: 'Điều kiện phá sản',
  penaltyCount: 'Số bài gỡ mỗi lần',
  penaltyPlayers: 'Áp dụng người đặt cược',
  penaltyDealer: 'Áp dụng người cầm cái',
  penaltyAnnounce: 'Thông báo cả phòng',
  moderatorManage: 'Người điều hành được quản lý bàn',
  moderatorRestore: 'Người điều hành được khôi phục bài',
  publishHistory: 'Cho thành viên xem lịch sử vòng',
  showCommitment: 'Hiển thị nút xem cam kết trước khi mở bát',
  showVerification: 'Hiển thị nút xác minh kết quả sau vòng',
};
const groups: { title: string; keys: (keyof Settings)[] }[] = [
  { title: 'Bàn chơi', keys: ['enabled', 'capacity', 'spectators', 'autoNext'] },
  {
    title: 'Cược coin ảo',
    keys: ['minBet', 'maxBet', 'playerLimit', 'tableLimit', 'customStake', 'undoBet'],
  },
  {
    title: 'Người cầm cái',
    keys: ['rotateDealer', 'dealerRounds', 'dealerMinimum', 'disconnectPolicy'],
  },
  {
    title: 'Nhịp vòng chơi',
    keys: [
      'bettingSeconds',
      'lockingSeconds',
      'shakingSeconds',
      'revealingSeconds',
      'resultSeconds',
    ],
  },
  {
    title: 'Hình phạt nhạc',
    keys: [
      'penaltyEnabled',
      'penaltyTrigger',
      'penaltyCount',
      'penaltyPlayers',
      'penaltyDealer',
      'penaltyAnnounce',
    ],
  },
  { title: 'Quyền trong phòng', keys: ['moderatorManage', 'moderatorRestore', 'publishHistory'] },
  { title: 'Thông tin công bằng', keys: ['showCommitment', 'showVerification'] },
];
export default function BauSettings({
  data,
  owner,
  send,
}: {
  data: BauSnapshot;
  owner: boolean;
  send: (command: BauCommand) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState(data.settings),
    [confirm, setConfirm] = useState(false),
    [economy, setEconomy] = useState(data.economy),
    [reason, setReason] = useState(''),
    [target, setTarget] = useState(''),
    [amount, setAmount] = useState(1000);
  return (
    <div className="bau-settings">
      {owner && (
        <>
          <p>
            Luật mới áp dụng từ vòng tiếp theo. Các cược đã nhận giữ nguyên luật hiển thị lúc mở
            vòng.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const result = settingsSchema.safeParse(draft);
              if (!result.success) {
                toast.error('Kiểm tra giới hạn và thời gian đã nhập.');
                return;
              }
              setConfirm(true);
            }}
          >
            {groups.map((group) => (
              <fieldset key={group.title}>
                <legend>{group.title}</legend>
                <div className="bau-fields">
                  {group.keys.map((key) => (
                    <label key={key} className={typeof draft[key] === 'boolean' ? 'bau-check' : ''}>
                      {typeof draft[key] === 'boolean' ? (
                        <>
                          <input
                            type="checkbox"
                            checked={draft[key] as boolean}
                            onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                          />
                          {settingLabels[key]}
                        </>
                      ) : (
                        <>
                          {settingLabels[key]}
                          {key === 'disconnectPolicy' ? (
                            <select
                              value={draft.disconnectPolicy}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  disconnectPolicy: e.target.value as Settings['disconnectPolicy'],
                                })
                              }
                            >
                              <option value="ROTATE">Chuyển cái sau khi quyết toán</option>
                              <option value="PAUSE">Tạm dừng sau khi quyết toán</option>
                            </select>
                          ) : key === 'penaltyTrigger' ? (
                            <select
                              value={draft.penaltyTrigger}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  penaltyTrigger: e.target.value as Settings['penaltyTrigger'],
                                })
                              }
                            >
                              <option value="ZERO">Tổng coin bằng 0</option>
                              <option value="BELOW_MINIMUM">Tổng coin dưới cược tối thiểu</option>
                            </select>
                          ) : (
                            <input
                              type="number"
                              step="1"
                              required
                              value={draft[key] as number}
                              onChange={(e) =>
                                setDraft({ ...draft, [key]: Number(e.target.value) })
                              }
                            />
                          )}
                        </>
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <Button type="submit" variant="primary">
              Lưu cấu hình phòng
            </Button>
          </form>
          <Modal
            open={confirm}
            onOpenChange={setConfirm}
            title="Áp dụng luật từ vòng tiếp theo?"
            description={`Hình phạt nhạc ${draft.penaltyEnabled ? 'bật, tối đa ' + draft.penaltyCount + ' bài đang chờ của chính người hết coin' : 'tắt'}. Cược đã nhận không bị đổi luật.`}
          >
            <div className="dialog-actions">
              <Button onClick={() => setConfirm(false)}>Hủy</Button>
              <AsyncButton
                variant="primary"
                onClick={async () => {
                  await send({
                    action: 'settings',
                    settings: settingsSchema.parse(draft),
                    confirmed: true,
                  });
                  setConfirm(false);
                }}
              >
                Xác nhận lưu
              </AsyncButton>
            </div>
          </Modal>
        </>
      )}
      {data.systemAdmin && (
        <details>
          <summary>Chính sách coin toàn ROOMTUNE</summary>
          <p>
            Chỉ quản trị hệ thống được thay đổi. Coin khởi đầu mới không cấp lại cho ví đã tồn tại.
          </p>
          <div className="bau-fields">
            {(
              ['initial', 'dailyAmount', 'reliefAmount', 'reliefThreshold', 'reliefHours'] as const
            ).map((key, i) => (
              <label key={key}>
                {
                  [
                    'Coin khởi đầu',
                    'Thưởng mỗi ngày',
                    'Coin cứu trợ',
                    'Ngưỡng nhận cứu trợ',
                    'Giờ giữa hai lần cứu trợ',
                  ][i]
                }
                <input
                  type="number"
                  value={economy[key]}
                  onChange={(e) => setEconomy({ ...economy, [key]: Number(e.target.value) })}
                />
              </label>
            ))}
            <label>
              Múi giờ ngày thưởng
              <select
                value={economy.timezone}
                onChange={(e) =>
                  setEconomy({ ...economy, timezone: e.target.value as typeof economy.timezone })
                }
              >
                <option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
          </div>
          <label className="bau-check">
            <input
              type="checkbox"
              checked={economy.dailyEnabled}
              onChange={(e) => setEconomy({ ...economy, dailyEnabled: e.target.checked })}
            />
            Bật thưởng hàng ngày
          </label>
          <label className="bau-check">
            <input
              type="checkbox"
              checked={economy.reliefEnabled}
              onChange={(e) => setEconomy({ ...economy, reliefEnabled: e.target.checked })}
            />
            Bật cứu trợ
          </label>
          <label>
            Lý do quản trị
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              maxLength={200}
            />
          </label>
          <AsyncButton
            disabled={reason.trim().length < 5}
            onClick={async () => {
              const parsed = economySchema.safeParse(economy);
              if (!parsed.success) {
                toast.error('Cấu hình coin không hợp lệ.');
                return;
              }
              await send({ action: 'economy', economy: parsed.data, reason });
            }}
          >
            Lưu chính sách coin
          </AsyncButton>
          <hr />
          <h3>Điều chỉnh coin có ghi sổ</h3>
          <label>
            Thành viên
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Chọn thành viên của bàn</option>
              {data.members.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số coin cộng/trừ
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <AsyncButton
            disabled={
              !target || reason.trim().length < 5 || !Number.isSafeInteger(amount) || amount === 0
            }
            onClick={() => send({ action: 'adjust', user: target, amount, reason })}
          >
            Ghi điều chỉnh
          </AsyncButton>
        </details>
      )}
    </div>
  );
}
