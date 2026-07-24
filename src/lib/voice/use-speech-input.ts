"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * Minimal shape of the Web Speech API we use. It isn't in the standard DOM lib
 * types and is still vendor-prefixed on some engines, so we type just enough to
 * stay `any`-free.
 */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechInput = {
  supported: boolean;
  listening: boolean;
  /** Start dictation. `onText` receives the running transcript as it grows. */
  start: (onText: (text: string) => void) => void;
  stop: () => void;
};

/**
 * Voice dictation for the ask box. Defaults to en-IN so Hinglish and Indian
 * English transcribe well; the agentic chat (#69) already handles code-switched
 * text downstream. In the Capacitor shell this keeps working via the WebView's
 * speech engine, with a native plugin fallback if needed (#143).
 */
const emptySubscribe = () => () => {};

export function useSpeechInput(lang = "en-IN"): SpeechInput {
  // Client-only capability check without an effect-setState (which cascades):
  // false on the server, real value after hydration - no mismatch.
  const supported = useSyncExternalStore(
    emptySubscribe,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      recRef.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = getCtor();
      if (!Ctor) return;
      // Restarting: drop any prior instance first.
      recRef.current?.stop();

      const rec = new Ctor();
      rec.lang = lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let text = "";
        for (let i = 0; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        onText(text);
      };
      rec.onerror = () => setListening(false);
      rec.onend = () => setListening(false);
      recRef.current = rec;
      setListening(true);
      rec.start();
    },
    [lang],
  );

  return { supported, listening, start, stop };
}
