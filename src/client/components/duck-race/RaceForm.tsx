import { useState, type FormEvent } from 'react';
import { Check, FileUp, ListPlus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Snapshot } from '../../../shared/contracts';
import {
  defaultRaceConfig,
  raceConfigSchema,
  tracks,
  type DuckCommand,
  type DuckSnapshot,
  type EntryInput,
  type Race,
  type RaceConfig,
} from '../../../shared/duck-race/contracts';
import { parseEntries } from '../../../shared/duck-race/import';
import { AsyncButton, Button, Confirm } from '../ui';
import { maps, skins } from './design';
export type SendDuck = (command?: DuckCommand) => Promise<DuckSnapshot>;
export function RaceForm({
  snapshot,
  race,
  settings,
  presets,
  send,
  done,
}: {
  snapshot: Snapshot;
  race?: Race;
  settings: DuckSnapshot['settings'];
  presets: DuckSnapshot['presets'];
  send: SendDuck;
  done: (id: string) => void;
}) {
  const [name, setName] = useState(race?.name ?? 'Một vòng vui cùng nhau');
  const [config, setConfig] = useState<RaceConfig>(
    (race
      ? {
          ...race.config,
          ...(snapshot.role !== 'owner' && race.config.mode === 'SONG'
            ? { songPriority: settings.songPriority }
            : {}),
        }
      : null) ?? {
      ...structuredClone(defaultRaceConfig),
      mode: snapshot.role === 'owner' ? 'PLAYER' : 'SONG',
      songPriority: settings.songPriority,
    },
  );
  const [listed, setEntries] = useState<EntryInput[]>(
    race?.entries.map((e) => ({ name: e.name, skin: e.skin, team: e.team })) ?? [],
  );
  const [text, setText] = useState('');
  const [picked, setSongs] = useState<string[]>(
    race?.entries.flatMap((e) => (e.songId ? [e.songId] : [])) ?? [],
  );
  const songs = picked,
    entries = listed;
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [numbered, setNumbered] = useState(8),
    [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');
  const owner = snapshot.role === 'owner';
  const available = snapshot.queue.filter((e) => e.status === 'QUEUED');
  const songLimit = Math.min(config.capacity, settings.maxSongEntries);
  function preview(value = text) {
    try {
      setEntries(parseEntries(value));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = raceConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError('Hãy kiểm tra thời lượng, giới hạn và số coin đã nhập.');
      return;
    }
    // Songs that started playing since the race was set up can no longer race.
    const songs = picked.filter((id) => available.some((e) => e.id === id));
    if (config.mode === 'SONG' && songs.length < picked.length) setSongs(songs);
    // A pasted list counts even if "Xem trước danh sách" was never pressed.
    let entries = listed;
    if (config.mode === 'CUSTOM' && !entries.length && text.trim()) {
      try {
        entries = parseEntries(text);
        setEntries(entries);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
    }
    if (config.mode === 'CUSTOM' && entries.some((e) => !e.name.trim())) {
      setError('Mỗi vịt cần một tên, không để trống.');
      return;
    }
    if (config.mode === 'SONG' && (!settings.songEnabled || songs.length > songLimit)) {
      setError(
        !settings.songEnabled
          ? 'Chủ phòng đã tắt đua bài hát.'
          : `Chỉ được chọn tối đa ${songLimit} bài.`,
      );
      return;
    }
    if (config.mode !== 'PLAYER' && (config.mode === 'SONG' ? songs.length : entries.length) < 2) {
      setError('Cần chọn ít nhất hai bài hoặc hai mục để đua.');
      return;
    }
    if (
      (config.mode === 'SONG'
        ? songs.length
        : config.mode === 'CUSTOM'
          ? entries.length
          : (race?.entries.length ?? 0)) > config.capacity
    ) {
      setError('Số mục đã chọn vượt quá số vịt tối đa.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let result: DuckSnapshot;
      if (race) {
        result = await send({
          action: 'configure',
          name: name.trim(),
          config: parsed.data,
          ...(config.mode !== 'PLAYER' ? { entries, songs } : {}),
        });
      } else
        result = await send({
          action: 'create',
          name: name.trim(),
          config: parsed.data,
          entries,
          songs,
        });
      done(result.race!.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="duck-form">
      <fieldset disabled={busy}>
        <label>
          Tên cuộc đua
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="duck-mode-picker" role="group" aria-label="Chế độ đua">
          {(
            [
              ['PLAYER', '🦆', 'Đua thành viên'],
              ['SONG', '♫', 'Đua bài hát'],
              ['CUSTOM', '✦', 'Danh sách tùy chọn'],
            ] as const
          )
            .filter(([mode]) => owner || (race && race.config.mode !== 'SONG') || mode === 'SONG')
            .map(([mode, icon, label]) => (
              <button
                type="button"
                key={mode}
                aria-pressed={config.mode === mode}
                disabled={
                  mode === 'SONG' && (!settings.songEnabled || (!owner && settings.songOwnerOnly))
                }
                onClick={() => setConfig((c) => ({ ...c, mode }))}
              >
                <span>{icon}</span>
                {label}
              </button>
            ))}
        </div>
        <div className="duck-map-picker" role="group" aria-label="Chọn đường đua">
          {tracks.map((track) => (
            <button
              type="button"
              key={track}
              className={`duck-map-card map-${track.toLowerCase()}`}
              aria-pressed={config.track === track}
              onClick={() => setConfig((c) => ({ ...c, track }))}
            >
              <span className="duck-map-art" aria-hidden="true">
                <i />
                {maps[track].icon}
                <b>🦆</b>
              </span>
              <strong>{maps[track].name}</strong>
              <small>{maps[track].subtitle}</small>
              {config.track === track && <Check size={15} />}
            </button>
          ))}
        </div>
        <div className="duck-fields">
          <label>
            Thời lượng
            <select
              aria-label="Thời lượng"
              value={config.duration}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  duration: Number(e.target.value) as RaceConfig['duration'],
                }))
              }
            >
              {[30, 45, 60, 90, 120].map((n) => (
                <option key={n} value={n}>
                  {n} giây
                </option>
              ))}
            </select>
          </label>
          <label>
            Số vịt tối đa
            <input
              type="number"
              min={2}
              max={30}
              value={config.capacity}
              onChange={(e) => setConfig((c) => ({ ...c, capacity: Number(e.target.value) }))}
            />
          </label>
        </div>
        <label>
          Ngưỡng về đích sát nút (mili giây)
          <input
            type="number"
            min={20}
            max={1000}
            value={config.photoFinishMs}
            onChange={(e) => setConfig((c) => ({ ...c, photoFinishMs: Number(e.target.value) }))}
          />
          <small>
            Hai vịt đầu về cách nhau không quá ngưỡng này sẽ được đánh dấu Photo Finish.
          </small>
        </label>
        {config.mode === 'PLAYER' && (
          <p className="muted">
            Mỗi thành viên tự tham gia, chọn một chú vịt và bấm sẵn sàng. Mọi skin có cơ hội thắng
            như nhau.
          </p>
        )}
        {config.mode === 'SONG' && (
          <section>
            <div className="duck-section-title">
              <h3>Chọn bài đang chờ</h3>
              <Button onClick={() => setSongs(available.slice(0, songLimit).map((e) => e.id))}>
                Chọn tối đa {songLimit} bài
              </Button>
            </div>
            <div className="duck-song-list">
              {available.length === 0 ? (
                <p>Chưa có bài trong hàng chờ. Thêm nhạc vào phòng trước khi tạo cuộc đua.</p>
              ) : (
                available.map((e) => (
                  <label key={e.id}>
                    <input
                      type="checkbox"
                      checked={songs.includes(e.id)}
                      disabled={!songs.includes(e.id) && songs.length >= songLimit}
                      onChange={(event) =>
                        setSongs((old) =>
                          event.target.checked ? [...old, e.id] : old.filter((id) => id !== e.id),
                        )
                      }
                    />
                    <span>
                      <strong>{e.song.title}</strong>
                      <small>Đề cử bởi {e.requester}</small>
                    </span>
                  </label>
                ))
              )}
            </div>
            <label>
              Bài thắng
              <select
                aria-label="Bài thắng"
                disabled={!owner}
                value={config.songPriority}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    songPriority: e.target.value as RaceConfig['songPriority'],
                  }))
                }
              >
                <option value="OFF">Chỉ công bố kết quả</option>
                <option value="APPROVAL">Chủ phòng duyệt đưa lên đầu</option>
                <option value="AUTO">Tự động đưa lên đầu hàng chờ</option>
              </select>
            </label>
            <small>
              Bài đang phát vẫn tiếp tục. Bài thắng không còn chờ sẽ được bỏ qua, các bài khác vẫn
              được giữ.
            </small>
          </section>
        )}
        {config.mode === 'CUSTOM' && (
          <section>
            <div className="duck-section-title">
              <h3>Danh sách của bạn</h3>
              <label className="button duck-upload">
                <FileUp size={16} /> Nhập CSV
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 20000) {
                      setError('Tệp tối đa 20 KB.');
                      return;
                    }
                    const value = await file.text();
                    setText(value);
                    preview(value);
                  }}
                />
              </label>
            </div>
            <label>
              Dán tên, mỗi dòng một mục
              <textarea
                rows={4}
                maxLength={20000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={'Phở\nBún bò\nCơm tấm'}
              />
            </label>
            <div className="duck-actions">
              <Button onClick={() => preview()}>
                <ListPlus size={16} /> Xem trước danh sách
              </Button>
              <label className="duck-numbered">
                Tạo số
                <input
                  aria-label="Số mục đánh số"
                  type="number"
                  min={2}
                  max={30}
                  value={numbered}
                  onChange={(e) => setNumbered(Number(e.target.value))}
                />
              </label>
              <Button
                onClick={() => {
                  if (numbered < 2 || numbered > 30) return;
                  setEntries(
                    Array.from({ length: numbered }, (_, i) => ({
                      name: `Số ${i + 1}`,
                      team: '',
                      skin: 'YELLOW',
                    })),
                  );
                }}
              >
                Tạo
              </Button>
            </div>
            {presets.length > 0 && (
              <label>
                Dùng danh sách đã lưu
                <select
                  aria-label="Dùng danh sách đã lưu"
                  value={selectedPreset}
                  onChange={(e) => {
                    setSelectedPreset(e.target.value);
                    const preset = presets.find((p) => p.id === e.target.value);
                    if (preset) setEntries(preset.entries);
                  }}
                >
                  <option value="" disabled>
                    Chọn danh sách
                  </option>
                  {presets.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {owner && presets.some((p) => p.id === selectedPreset) && (
              <Confirm
                title="Xóa danh sách đã lưu?"
                description="Danh sách trong cuộc đua hiện tại vẫn được giữ."
                onConfirm={async () => {
                  await send({ action: 'delete_preset', id: selectedPreset });
                  setSelectedPreset('');
                }}
              >
                <Button>
                  <Trash2 size={15} /> Xóa danh sách đã lưu
                </Button>
              </Confirm>
            )}
            <div className="duck-entry-editor">
              {entries.map((entry, i) => (
                <div key={i}>
                  <span>{i + 1}</span>
                  <input
                    aria-label={`Tên mục ${i + 1}`}
                    required
                    maxLength={80}
                    value={entry.name}
                    onChange={(e) =>
                      setEntries((old) =>
                        old.map((v, j) => (i === j ? { ...v, name: e.target.value } : v)),
                      )
                    }
                  />
                  <select
                    aria-label={`Kiểu vịt ${i + 1}`}
                    value={entry.skin}
                    onChange={(e) =>
                      setEntries((old) =>
                        old.map((v, j) =>
                          i === j ? { ...v, skin: e.target.value as EntryInput['skin'] } : v,
                        ),
                      )
                    }
                  >
                    {Object.entries(skins).map(([value, skin]) => (
                      <option key={value} value={value}>
                        {skin.icon} {skin.name}
                      </option>
                    ))}
                  </select>
                  {config.tournament.kind === 'TEAM' && (
                    <input
                      aria-label={`Đội mục ${i + 1}`}
                      placeholder="Đội"
                      maxLength={30}
                      value={entry.team}
                      onChange={(e) =>
                        setEntries((old) =>
                          old.map((v, j) => (i === j ? { ...v, team: e.target.value } : v)),
                        )
                      }
                    />
                  )}
                  <Button
                    size="icon"
                    aria-label={`Xóa mục ${i + 1}`}
                    onClick={() => setEntries((old) => old.filter((_, j) => i !== j))}
                  >
                    <Trash2 size={15} />
                  </Button>
                </div>
              ))}
            </div>
            {owner && entries.length >= 2 && (
              <div className="duck-actions">
                <input
                  aria-label="Tên danh sách lưu"
                  maxLength={80}
                  placeholder="Tên danh sách để dùng lại"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
                <AsyncButton
                  disabled={!presetName.trim()}
                  onClick={async () => {
                    await send({ action: 'save_preset', name: presetName, entries });
                    toast.success('Đã lưu danh sách.');
                  }}
                >
                  <Save size={16} /> Lưu
                </AsyncButton>
              </div>
            )}
          </section>
        )}
        <details open={config.tournament.kind !== 'SINGLE'}>
          <summary>Giải đấu & vòng đua</summary>
          <div className="duck-fields">
            <label>
              Thể thức
              <select
                aria-label="Thể thức"
                value={config.tournament.kind}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    tournament: {
                      ...c.tournament,
                      kind: e.target.value as RaceConfig['tournament']['kind'],
                    },
                  }))
                }
              >
                <option value="SINGLE">Một lượt đua</option>
                <option value="POINTS">Cộng điểm nhiều vòng</option>
                <option value="ELIMINATION">Loại dần</option>
                <option value="WINNER_REMOVAL">Người thắng nhường lượt sau</option>
                <option value="TEAM">Đua theo đội</option>
              </select>
            </label>
            {config.tournament.kind !== 'SINGLE' && (
              <label>
                Số vòng tối đa
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={config.tournament.rounds}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tournament: { ...c.tournament, rounds: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            )}
            {config.tournament.kind === 'ELIMINATION' && (
              <label>
                Số vịt đi tiếp
                <input
                  type="number"
                  min={1}
                  max={29}
                  value={config.tournament.advance}
                  onChange={(e) =>
                    setConfig((c) => ({
                      ...c,
                      tournament: { ...c.tournament, advance: Number(e.target.value) },
                    }))
                  }
                />
              </label>
            )}
          </div>
          <p className="muted">
            Với N vịt, hạng 1 nhận N điểm, hạng 2 nhận N−1 điểm. Điểm đội là tổng điểm của các thành
            viên. Bằng điểm xét số lần thắng; nếu vẫn bằng thì đồng hạng.
          </p>
        </details>
        {config.mode === 'PLAYER' && (
          <details>
            <summary>Coin giải trí</summary>
            <label className="duck-check">
              <input
                type="checkbox"
                disabled={!owner}
                checked={config.rewards.enabled}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, rewards: { ...c.rewards, enabled: e.target.checked } }))
                }
              />{' '}
              Thưởng coin từ ví ROOMTUNE
            </label>
            {config.rewards.enabled && (
              <div className="duck-fields">
                {(
                  [
                    ['winner', 'Hạng nhất', 5000],
                    ['runnerUp', 'Hạng nhì', 5000],
                    ['participation', 'Tham gia', 100],
                    ['budget', 'Tổng tối đa mỗi lượt', 10000],
                  ] as const
                ).map(([key, label, max]) => (
                  <label key={key}>
                    {label}
                    <input
                      disabled={!owner}
                      type="number"
                      min={0}
                      max={max}
                      value={config.rewards[key]}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          rewards: { ...c.rewards, [key]: Number(e.target.value) },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            )}
            <small>
              Coin ảo để vui trong phòng. Giới hạn tổng được chia theo thứ hạng, không đặt cược.
            </small>
          </details>
        )}
      </fieldset>
      {error && (
        <p className="duck-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" loading={busy} variant="primary">
        {race ? 'Lưu cài đặt' : 'Tạo cuộc đua'}
      </Button>
    </form>
  );
}
