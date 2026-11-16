import { useCallback, useEffect, useRef, useState } from 'react';

export interface VoiceRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  start(): void;
  abort(): void;
}
type VoiceWindow = Window & {
  SpeechRecognition?: new () => VoiceRecognition;
  webkitSpeechRecognition?: new () => VoiceRecognition;
};
export function useVoiceSearch(onText: (text: string) => void) {
  const [state, setState] = useState<'idle' | 'starting' | 'listening'>('idle');
  const [message, setMessage] = useState('');
  const [interim, setInterim] = useState('');
  const current = useRef<VoiceRecognition | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callback = useRef(onText);
  useEffect(() => {
    callback.current = onText;
  }, [onText]);
  const Recognition =
    (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
  const supported = Boolean(Recognition) && window.isSecureContext !== false;
  const dispose = useCallback(() => {
    clearTimeout(timer.current);
    const recognition = current.current;
    current.current = null;
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onerror = recognition.onresult = null;
      try {
        recognition.abort();
      } catch {
        /* already closed */
      }
    }
  }, []);
  const cancel = useCallback(() => {
    dispose();
    setState('idle');
    setInterim('');
  }, [dispose]);
  useEffect(() => {
    const hide = () => {
      if (document.visibilityState === 'hidden') cancel();
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', cancel);
    return () => {
      dispose();
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', cancel);
    };
  }, [cancel, dispose]);
  function start() {
    if (!supported || !Recognition || current.current) return;
    setMessage('');
    setInterim('');
    setState('starting');
    try {
      const recognition = new Recognition();
      current.current = recognition;
      recognition.lang = 'vi-VN';
      recognition.continuous = false;
      recognition.interimResults = true;
      const finish = (text: string) => {
        if (current.current !== recognition) return;
        cancel();
        setMessage(text);
      };
      recognition.onstart = () => {
        if (current.current === recognition) setState('listening');
      };
      recognition.onerror = ({ error }) =>
        finish(
          (
            {
              'not-allowed':
                'Chưa được phép dùng micro. Hãy cho phép micro trong trình duyệt rồi thử lại.',
              'service-not-allowed':
                'Trình duyệt đang chặn nhận dạng giọng nói. Bạn vẫn có thể gõ tên bài.',
              'audio-capture': 'Không tìm thấy micro. Kiểm tra thiết bị rồi thử lại.',
              network: 'Không kết nối được dịch vụ giọng nói. Bạn có thể gõ tên bài để tìm.',
              'no-speech': 'Chưa nghe rõ tên bài. Nhấn micro để thử lại.',
              aborted: '',
            } as Record<string, string>
          )[error] ?? 'Chưa nhận dạng được giọng nói. Hãy thử lại hoặc gõ tên bài.',
        );
      recognition.onend = () => finish('Chưa nghe rõ tên bài. Nhấn micro để thử lại.');
      recognition.onresult = (event) => {
        if (current.current !== recognition) return;
        let preview = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0].transcript.trim().replace(/\s+/g, ' ').slice(0, 120);
          if (result.isFinal && text) {
            finish(`Đã nghe: ${text}`);
            callback.current(text);
            return;
          }
          preview += text + ' ';
        }
        setInterim(preview.trim().slice(0, 120));
      };
      timer.current = setTimeout(() => finish('Đã dừng micro. Nhấn để thử lại.'), 20000);
      recognition.start();
    } catch {
      cancel();
      setMessage('Không mở được micro. Kiểm tra quyền truy cập hoặc nhập tên bài bằng bàn phím.');
    }
  }
  return { supported, state, message, interim, start, cancel };
}
