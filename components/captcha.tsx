'use client';
import { useEffect, useRef, useState } from 'react';
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let scriptReady: Promise<void> | undefined;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!scriptReady)
    scriptReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptReady = undefined;
        reject(new Error('Could not load verification.'));
      };
      document.head.appendChild(script);
    });
  return scriptReady;
}
export function Captcha({ onToken }: { onToken: (value: string) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const callback = useRef(onToken);
  const [error, setError] = useState('');
  useEffect(() => {
    callback.current = onToken;
  }, [onToken]);
  useEffect(() => {
    let stopped = false,
      widget: string | undefined;
    void load()
      .then(() => {
        if (stopped || !element.current || !window.turnstile) return;
        widget = window.turnstile.render(element.current, {
          sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            callback.current(token);
            setError('');
          },
          'expired-callback': () => callback.current(''),
          'error-callback': () => {
            callback.current('');
            setError('Verification failed. Reload the page to retry.');
          },
        });
      })
      .catch(() => {
        if (!stopped) setError('Verification could not load. Check your connection and reload.');
      });
    return () => {
      stopped = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, []);
  return (
    <div>
      <div ref={element} />
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
