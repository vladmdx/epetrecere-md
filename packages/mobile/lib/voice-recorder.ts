// Voice recorder hook.
//
// Hold-to-record UX: caller wires the same handler to onPressIn (start)
// and onPressOut (stop). On stop we upload the recording to the
// transcription endpoint and surface the resulting text via the
// onTranscript callback.
//
// Caps the recording at 60s so a stuck press doesn't run away. The
// recorder uses high-quality preset, but mono and 22kHz — Whisper
// works fine at that quality and the upload is smaller (~30kb/sec).

import { useCallback, useRef, useState } from "react";
import { Audio } from "expo-av";

interface Options {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  onTranscript: (text: string) => void;
  /** Hard cap on recording length in seconds. Default 60. */
  maxSeconds?: number;
}

export function useVoiceRecorder({
  apiUrl,
  getToken,
  onTranscript,
  maxSeconds = 60,
}: Options) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);

  const startRecording = useCallback(async () => {
    try {
      // Ask for mic permission lazily (only when user first tries to
      // record). Skip permission prompt if already granted.
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        // Stay quiet on background music — we're voice-noting, not
        // a phone call.
        shouldDuckAndroid: true,
      });

      // Mid-quality preset: 22kHz mono, m4a on iOS, 3gpp on Android.
      // Smaller upload than HIGH_QUALITY (44kHz stereo) and Whisper
      // can't tell the difference for human speech.
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.LOW_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.LOW_QUALITY.android,
          numberOfChannels: 1,
          sampleRate: 22_050,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.LOW_QUALITY.ios,
          numberOfChannels: 1,
          sampleRate: 22_050,
        },
      });
      recordingRef.current = recording;
      setIsRecording(true);

      // Auto-stop guard
      autoStopRef.current = setTimeout(() => {
        void stopRecording();
      }, maxSeconds * 1000);
    } catch (err) {
      console.error("[voice] start failed", err);
      setIsRecording(false);
    }
  }, [maxSeconds]);

  const stopRecording = useCallback(async () => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
      return;
    }
    recordingRef.current = null;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setIsRecording(false);
      if (!uri) return;

      // Upload + transcribe
      setTranscribing(true);
      const token = await getToken();
      if (!token) {
        setTranscribing(false);
        return;
      }

      const form = new FormData();
      // Detect extension — iOS .m4a, Android .3gp by default.
      const filename = uri.split("/").pop() ?? "voice.m4a";
      const ext = filename.includes(".") ? filename.split(".").pop() : "m4a";
      const type =
        ext === "3gp" || ext === "3gpp"
          ? "audio/3gpp"
          : ext === "wav"
            ? "audio/wav"
            : "audio/m4a";
      form.append("file", {
        uri,
        name: filename,
        type,
      } as unknown as Blob);

      const res = await fetch(`${apiUrl}/ai/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = (data.text ?? "").trim();
        if (text) onTranscript(text);
      } else {
        console.error("[voice] transcribe failed", res.status);
      }
    } catch (err) {
      console.error("[voice] stop/transcribe failed", err);
    } finally {
      setTranscribing(false);
    }
  }, [apiUrl, getToken, onTranscript]);

  return {
    isRecording,
    transcribing,
    startRecording,
    stopRecording,
  };
}
