import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { TarotAiView } from '../../../shared/tarot/contracts';
import { api } from '../../lib/api';
import { Button } from '../ui';
import './tarot.css';

/**
 * Room-settings section: the owner's own OpenAI-compatible AI for Tarot readings, like Cursor's
 * "Override OpenAI Base URL". The key is write-only; the server keeps it encrypted.
 */
export default function TarotAiSetting({ room, actor }: { room: string; actor: string }) {
  const client = useQueryClient();
  const key = ['tarot-ai', room, actor];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<TarotAiView>(`/rooms/${room}/tarot/ai`, undefined, undefined, actor),
  });
  const saved = query.data;
  const [enabled, setEnabled] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // Fill the form once the saved setup arrives (and after each save).
  useEffect(() => {
    if (!saved) return;
    setEnabled(saved.enabled);
    setBaseUrl(saved.base_url);
    setModel(saved.model);
  }, [saved]);
  const hasKey = Boolean(apiKey.trim()) || Boolean(saved?.has_key);
  const complete = Boolean(baseUrl.trim() && model.trim() && hasKey);

  async function save(change: { clear?: boolean } = {}) {
    setBusy(change.clear ? 'clear' : 'save');
    try {
      const next = await api<TarotAiView>(
        `/rooms/${room}/tarot/ai`,
        {
          enabled: change.clear ? false : enabled,
          base_url: baseUrl.trim(),
          model: model.trim(),
          ...(apiKey.trim() && !change.clear ? { api_key: apiKey.trim() } : {}),
          ...(change.clear ? { clear_key: true } : {}),
        },
        undefined,
        actor,
      );
      client.setQueryData(key, next);
      setApiKey('');
      toast.success(change.clear ? 'Đã xóa API key.' : 'Đã lưu AI riêng của phòng.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chưa lưu được.');
    } finally {
      setBusy(null);
    }
  }
  async function test() {
    setBusy('test');
    setResult(null);
    try {
      setResult(
        await api<{ ok: boolean; message: string }>(
          `/rooms/${room}/tarot/ai/test`,
          {
            base_url: baseUrl.trim(),
            model: model.trim(),
            ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          },
          undefined,
          actor,
        ),
      );
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Chưa thử được kết nối.',
      });
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
      <label className="toggle-row">
        <span>Dùng API riêng</span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={!saved}
          onChange={(event) => setEnabled(event.target.checked)}
        />
      </label>
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
      {result && (
        <p className={result.ok ? 'tarot-ai-test ok' : 'tarot-ai-test fail'} role="status">
          {result.message}
        </p>
      )}
      <div className="tarot-ai-actions">
        <Button
          loading={busy === 'test'}
          disabled={!saved || busy !== null || !complete}
          onClick={() => void test()}
        >
          Thử kết nối
        </Button>
        <Button
          variant="primary"
          loading={busy === 'save'}
          disabled={!saved || busy !== null || (enabled && !complete)}
          onClick={() => void save()}
        >
          Lưu AI riêng
        </Button>
        {saved?.has_key && (
          <Button
            loading={busy === 'clear'}
            disabled={busy !== null}
            onClick={() => void save({ clear: true })}
          >
            Xóa key
          </Button>
        )}
      </div>
      <p className="muted">
        Key được mã hóa trên máy chủ và không bao giờ hiện lại. Chi phí gọi API tính vào key này.
      </p>
    </fieldset>
  );
}
