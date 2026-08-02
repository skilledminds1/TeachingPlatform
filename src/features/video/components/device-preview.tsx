"use client";

import {
  Camera,
  CameraOff,
  CheckCircle2,
  Mic,
  MicOff,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { createLocalTracks, type LocalAudioTrack, type LocalVideoTrack } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DeviceOption = {
  deviceId: string;
  label: string;
};

const selectClassName =
  "h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function DevicePreview() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioTrackRef = useRef<LocalAudioTrack | null>(null);
  const videoTrackRef = useRef<LocalVideoTrack | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [micLevel, setMicLevel] = useState(0);
  const [audioDevices, setAudioDevices] = useState<DeviceOption[]>([]);
  const [videoDevices, setVideoDevices] = useState<DeviceOption[]>([]);
  const [audioDeviceId, setAudioDeviceId] = useState("");
  const [videoDeviceId, setVideoDeviceId] = useState("");

  const stopMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => undefined);
      audioContextRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const cleanupTracks = useCallback(() => {
    stopMeter();
    audioTrackRef.current?.stop();
    videoTrackRef.current?.stop();
    audioTrackRef.current = null;
    videoTrackRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, [stopMeter]);

  const stopPreview = useCallback(() => {
    cleanupTracks();
    setActive(false);
    setStarting(false);
    setError(null);
  }, [cleanupTracks]);

  const startMeter = useCallback(
    (track: LocalAudioTrack) => {
      stopMeter();
      const mediaStreamTrack = track.mediaStreamTrack;
      if (!mediaStreamTrack) return;

      const context = new AudioContext();
      const source = context.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        const current = analyserRef.current;
        if (!current) return;
        current.getByteFrequencyData(data);
        const average = data.reduce((sum, value) => sum + value, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((average / 140) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      void context.resume().then(() => {
        rafRef.current = requestAnimationFrame(tick);
      });
    },
    [stopMeter],
  );

  const refreshDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audio = devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Microphone ${index + 1}`,
      }));
    const video = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));
    setAudioDevices(audio);
    setVideoDevices(video);
    setAudioDeviceId((current) =>
      current && audio.some((device) => device.deviceId === current)
        ? current
        : (audio[0]?.deviceId ?? ""),
    );
    setVideoDeviceId((current) =>
      current && video.some((device) => device.deviceId === current)
        ? current
        : (video[0]?.deviceId ?? ""),
    );
  }, []);

  const startPreview = useCallback(async () => {
    setStarting(true);
    setError(null);
    try {
      cleanupTracks();
      const tracks = await createLocalTracks({
        audio: audioDeviceId ? { deviceId: audioDeviceId } : true,
        video: videoDeviceId ? { deviceId: videoDeviceId } : true,
      });
      const audioTrack = tracks.find((track) => track.kind === "audio") as
        | LocalAudioTrack
        | undefined;
      const videoTrack = tracks.find((track) => track.kind === "video") as
        | LocalVideoTrack
        | undefined;

      if (!audioTrack && !videoTrack) {
        throw new Error("No camera or microphone tracks were created.");
      }

      audioTrackRef.current = audioTrack ?? null;
      videoTrackRef.current = videoTrack ?? null;

      if (audioTrack) {
        startMeter(audioTrack);
      }

      await refreshDevices();
      setMicEnabled(true);
      setCameraEnabled(Boolean(videoTrack));
      setActive(true);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Could not access your camera or microphone.";
      cleanupTracks();
      setActive(false);
      setError(
        /Permission|NotAllowed|denied/i.test(message)
          ? "Camera or microphone permission was denied. Allow access in your browser settings, then try again."
          : message,
      );
    } finally {
      setStarting(false);
    }
  }, [audioDeviceId, cleanupTracks, refreshDevices, startMeter, videoDeviceId]);

  useEffect(() => () => cleanupTracks(), [cleanupTracks]);

  useEffect(() => {
    if (!active) return;
    const track = videoTrackRef.current;
    const element = videoRef.current;
    if (!track || !element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [active]);

  useEffect(() => {
    const track = audioTrackRef.current;
    if (!track) return;
    if (micEnabled) {
      void track.unmute();
      startMeter(track);
    } else {
      void track.mute();
      stopMeter();
    }
  }, [micEnabled, startMeter, stopMeter]);

  useEffect(() => {
    const track = videoTrackRef.current;
    if (!track) return;
    if (cameraEnabled) {
      void track.unmute();
    } else {
      void track.mute();
    }
  }, [cameraEnabled]);

  async function switchAudioDevice(deviceId: string): Promise<void> {
    setAudioDeviceId(deviceId);
    const track = audioTrackRef.current;
    if (!track || !active) return;
    try {
      await track.setDeviceId(deviceId);
      if (micEnabled) startMeter(track);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not switch microphone.");
    }
  }

  async function switchVideoDevice(deviceId: string): Promise<void> {
    setVideoDeviceId(deviceId);
    const track = videoTrackRef.current;
    if (!track || !active) return;
    try {
      await track.setDeviceId(deviceId);
      if (videoRef.current) {
        track.attach(videoRef.current);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not switch camera.");
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Test devices</h2>
        <p className="text-sm text-muted-foreground">
          Preview your camera and microphone before joining a lesson. This stays on your device
          and does not start a classroom session.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {!active ? (
          <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Camera className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="font-medium">Check your camera and mic</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Your browser will ask for permission the first time. Speak aloud to confirm the
                microphone level meter moves.
              </p>
            </div>
            {error ? (
              <div className="flex max-w-lg items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-start text-sm text-destructive">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <p>{error}</p>
              </div>
            ) : null}
            <Button onClick={() => void startPreview()} disabled={starting}>
              {starting ? (
                <>
                  <RefreshCw className="size-4 animate-spin" aria-hidden />
                  Starting preview…
                </>
              ) : (
                <>
                  <Camera className="size-4" aria-hidden />
                  Start device test
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
            <div className="relative aspect-video bg-black lg:aspect-auto lg:min-h-[280px]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cn(
                  "size-full object-cover",
                  !cameraEnabled && "opacity-0",
                )}
              />
              {!cameraEnabled ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/80">
                  <CameraOff className="size-8" aria-hidden />
                  <p className="text-sm">Camera is off</p>
                </div>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={micEnabled ? "secondary" : "destructive"}
                    onClick={() => setMicEnabled((value) => !value)}
                  >
                    {micEnabled ? <Mic className="size-4" aria-hidden /> : <MicOff className="size-4" aria-hidden />}
                    Mic
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={cameraEnabled ? "secondary" : "destructive"}
                    onClick={() => setCameraEnabled((value) => !value)}
                  >
                    {cameraEnabled ? (
                      <Camera className="size-4" aria-hidden />
                    ) : (
                      <CameraOff className="size-4" aria-hidden />
                    )}
                    Camera
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-xs text-white/90">
                  <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden />
                  Preview only
                </div>
              </div>
            </div>

            <div className="space-y-5 border-t border-border p-5 lg:border-t-0 lg:border-s">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="preview-mic">
                  Microphone
                </label>
                <select
                  id="preview-mic"
                  className={selectClassName}
                  value={audioDeviceId}
                  onChange={(event) => void switchAudioDevice(event.target.value)}
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Input level</span>
                    <span>{micEnabled ? `${micLevel}%` : "Muted"}</span>
                  </div>
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={micEnabled ? micLevel : 0}
                    aria-label="Microphone input level"
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-[width] duration-75"
                      style={{ width: `${micEnabled ? micLevel : 0}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="preview-camera">
                  Camera
                </label>
                <select
                  id="preview-camera"
                  className={selectClassName}
                  value={videoDeviceId}
                  onChange={(event) => void switchVideoDevice(event.target.value)}
                >
                  {videoDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  If the video looks clear and the level meter moves when you speak, you are ready
                  to join a lesson.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void startPreview()}>
                  <RefreshCw className="size-4" aria-hidden />
                  Restart test
                </Button>
                <Button type="button" variant="ghost" onClick={stopPreview}>
                  Stop preview
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
