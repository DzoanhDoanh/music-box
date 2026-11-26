import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TarotAiResult, TarotAiView } from '../../../shared/tarot/contracts';
import { api } from '../../lib/api';
import { Button } from '../ui';
import './tarot.css';

/**
 * Room-settings section: the owner's own OpenAI-compatible AI for Tarot readings, like Cursor's
 * "Override OpenAI Base URL". Two steps, enforced by the server too:
 *   1. "Kiểm tra & lưu" calls the API once and stores the setup only when it answered;
 *   2. the "Dùng API riêng" switch unlocks after that, and switching on tests again.
 * The key is write-only; the server keeps it encrypted.
 */
export default function TarotAiSetting({ room, actor }: { room: string; actor: string }) {
  const client = useQueryClient();
  const key = ['tarot-ai', room, actor];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<TarotAiView>(`/rooms/${room}/tarot/ai`, undefined, undefined, actor),
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
      const outcome = await api<TarotAiResult>(
        `/rooms/${room}/tarot/ai${path}`,
        body,
        undefined,
        actor,
      );
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
    <fieldset className="tarot-ai-setting">
      <legend>AI luận giải Tarot</legend>
      <p className="muted">
        Dùng API của bạn (chuẩn OpenAI <code>/chat/completions</code>: OpenAI, OpenRouter, Groq,
        DeepSeek, proxy riêng…). Khi tắt, phòng dùng AI mặc định của RoomTune; AI riêng bị lỗi cũng
        tự quay về AI mặc định.
      </p>
      <ol className="tarot-ai-steps">
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
      <div className="tarot-ai-actions">
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
        <p className={result.ok ? 'tarot-ai-test ok' : 'tarot-ai-test fail'} role="status">
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
          aria-describedby="tarot-ai-switch-help"
          onChange={(event) => void send('/enabled', { enabled: event.target.checked }, 'switch')}
        />
      </label>
      <p className="muted" id="tarot-ai-switch-help">
        {!ready
          ? 'Chưa bật được: cần kiểm tra & lưu API thành công trước.'
          : busy === 'switch'
            ? 'Đang kiểm tra lại API…'
            : saved?.enabled
              ? `Đang dùng ${saved.model} (key ••••${saved.key_hint ?? ''}) cho Bói Tarot.`
              : 'Đã lưu API. Bật lên để dùng; máy chủ sẽ kiểm tra lại trước khi bật.'}
        {ready && edited && ' Các thay đổi ở trên chưa được lưu.'}
      </p>
      <p className="muted">
        Key được mã hóa trên máy chủ và không bao giờ hiện lại. Chi phí gọi API tính vào key này.
      </p>
    </fieldset>
  );
}
