'use client';
import { useEffect } from 'react';
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page narrow">
      <h1>Something went wrong</h1>
      <p>Please try again. Your basket is saved on this device.</p>
      <button className="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
