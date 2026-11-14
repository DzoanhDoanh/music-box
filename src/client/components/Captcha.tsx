import { useEffect, useRef, useState } from 'react';
interface Turnstile {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      size: 'flexible';
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ): string;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loader: Promise<void> | undefined;
export const captchaRequired = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
export default function Captcha({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const element = useRef<HTMLDivElement>(null),
    callback = useRef(onToken),
    [error, setError] = useState(false);
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);
  useEffect(() => {
    if (!captchaRequired || !element.current) return;
    callback.current('');
    let stopped = false,
      widget: string | undefined;
    if (!loader)
      loader = new Promise<void>((resolve, reject) => {
        if (window.turnstile) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => {
          loader = undefined;
          reject(new Error('CAPTCHA unavailable'));
        };
        document.head.appendChild(script);
      });
    void loader
      .then(() => {
        if (stopped || !element.current || !window.turnstile) return;
        widget = window.turnstile.render(element.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          size: 'flexible',
          callback: (token) => {
            if (stopped) return;
            setError(false);
            callback.current(token);
          },
          'expired-callback': () => {
            if (!stopped) callback.current('');
          },
          'error-callback': () => {
            if (stopped) return;
            setError(true);
            callback.current('');
          },
        });
      })
      .catch(() => {
        if (!stopped) setError(true);
      });
    return () => {
      stopped = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [resetKey]);
  if (!captchaRequired) return null;
  return (
    <div>
      <div ref={element} />
      {error && (
        <p className="form-error" role="alert">
          Không tải được xác minh chống bot. Kiểm tra mạng và tải lại trang.
        </p>
      )}
    </div>
  );
}
