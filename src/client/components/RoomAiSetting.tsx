import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RoomAiResult, RoomAiView } from '../../shared/room-ai';
import { api } from '../lib/api';
import { Button } from './ui';
import './room-ai.css';

/**
 * Room-settings section: the room's AI, used by every AI feature in the room (Tarot readings
 * today). The owner brings their own OpenAI-compatible API, like Cursor's "Override OpenAI Base URL". Two steps, enforced by the server too:
 *   1. "Kiểm tra & lưu" calls the API once and stores the setup only when it answered;
 *   2. the "Dùng API riêng" switch unlocks after that, and switching on tests again.
 * The key is write-only; the server keeps it encrypted.
 */
export default function RoomAiSetting({ room, actor }: { room: string; actor: string }) {
  const client = useQueryClient();
  const key = ['room-ai', room, actor];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<RoomAiView>(`/rooms/${room}/ai`, undefined, undefined, actor),
  });
  const saved = query.data;
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'switch' | 'clear' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Fill the form once the saved setup arrives (and after each save).
  useEffect(() => {
    if (!saved) return;
    setBaseUrl(saved.base_url);
    setModel(saved.model);
  }, [saved]);
  const ready = Boolean(saved?.has_key && saved.base_url && saved.model);
  const canSave = Boolean(baseUrl.trim() && model.trim() && (apiKey.trim() || saved?.has_key));
  const edited =
    Boolean(saved) &&
    (baseUrl.trim() !== saved!.base_url || model.trim() !== saved!.model || Boolean(apiKey.trim()));

  async function send(path: string, body: unknown, kind: 'save' | 'switch' | 'clear') {
    setBusy(kind);
    setResult(null);
    try {
      const outcome = await api<RoomAiResult>(`/rooms/${room}/ai${path}`, body, undefined, actor);
      if (outcome.view) client.setQueryData(key, outcome.view);
      if (outcome.ok && kind === 'save') setApiKey('');
      setResult(outcome);
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'Chưa lưu được.' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <fieldset className="room-ai-setting">
      <legend>AI của phòng</legend>
      <p className="muted">
        Mọi tính năng AI trong phòng (hiện có: luận giải Bói Tarot) dùng chung cài đặt này. Dùng API
        của bạn theo chuẩn OpenAI <code>/chat/completions</code>: OpenAI, OpenRouter, Groq,
        DeepSeek, proxy riêng… Khi tắt, phòng dùng AI mặc định của RoomTune; AI riêng bị lỗi cũng tự
        quay về AI mặc định.
      </p>
      <ol className="room-ai-steps">
        <li>
          <b>Bước 1:</b> nhập Base URL, API key và model rồi bấm “Kiểm tra &amp; lưu”.
        </li>
        <li>
          <b>Bước 2:</b> lưu thành công thì mới bật được “Dùng API riêng”.
        </li>
      </ol>
      <label>
        Base URL
        <input
          type="url"
          inputMode="url"
          placeholder="https://api.openai.com/v1"
          value={baseUrl}
          maxLength={300}
          disabled={!saved}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </label>
      <label>
        API key
        <input
          type="password"
          autoComplete="off"
          placeholder={
            saved?.has_key ? `Đã lưu ••••${saved.key_hint ?? ''} · để trống để giữ` : 'sk-…'
          }
          value={apiKey}
          maxLength={500}
          disabled={!saved}
          onChange={(event) => setApiKey(event.target.value)}
        />
      </label>
      <label>
        Model
        <input
          placeholder="gpt-4o-mini"
          value={model}
          maxLength={120}
          disabled={!saved}
          onChange={(event) => setModel(event.target.value)}
        />
      </label>
      <div className="room-ai-actions">
        <Button
          variant="primary"
          loading={busy === 'save'}
          loadingLabel="Đang kiểm tra…"
          disabled={!saved || busy !== null || !canSave}
          onClick={() =>
            void send(
              '',
              {
                base_url: baseUrl.trim(),
                model: model.trim(),
                ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
              },
              'save',
            )
          }
        >
          Kiểm tra &amp; lưu
        </Button>
        {saved?.has_key && (
          <Button
            loading={busy === 'clear'}
            disabled={busy !== null}
            onClick={() => void send('/clear', {}, 'clear')}
          >
            Xóa key
          </Button>
        )}
      </div>
      {result && (
        <p className={result.ok ? 'room-ai-test ok' : 'room-ai-test fail'} role="status">
          {result.message}
        </p>
      )}
      <label className="toggle-row">
        <span>Dùng API riêng</span>
        <input
          type="checkbox"
          role="switch"
          checked={saved?.enabled ?? false}
          disabled={!ready || busy !== null}
          aria-describedby="room-ai-switch-help"
          onChange={(event) => void send('/enabled', { enabled: event.target.checked }, 'switch')}
        />
      </label>
      <p className="muted" id="room-ai-switch-help">
        {!ready
          ? 'Chưa bật được: cần kiểm tra & lưu API thành công trước.'
          : busy === 'switch'
            ? 'Đang kiểm tra lại API…'
            : saved?.enabled
              ? `Đang dùng ${saved.model} (key ••••${saved.key_hint ?? ''}) cho mọi tính năng AI trong phòng.`
              : 'Đã lưu API. Bật lên để dùng; máy chủ sẽ kiểm tra lại trước khi bật.'}
        {ready && edited && ' Các thay đổi ở trên chưa được lưu.'}
      </p>
      <p className="muted">
        Key được mã hóa trên máy chủ và không bao giờ hiện lại. Chi phí gọi API tính vào key này.
      </p>
    </fieldset>
  );
}
