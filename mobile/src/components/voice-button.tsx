import { useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet } from "react-native";
import { File } from "expo-file-system";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import { Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { colors, radius } from "@/theme/tokens";

/**
 * Grava a fala e devolve a transcrição bruta (Whisper no servidor), para a pessoa
 * revisar e editar antes de enviar. Um toque começa, outro termina.
 */
export function VoiceButton({ transcribe, onText, disabled }: { transcribe: (form: FormData) => Promise<{ text: string }>; onText: (text: string) => void; disabled?: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");

  async function start() {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Microfone", "Permita o uso do microfone para falar sua ideia.");
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setState("recording");
  }

  async function finish() {
    setState("sending");
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) throw new Error("A gravação não foi salva.");
      const form = new FormData();
      // No app nativo o fetch do Expo lê arquivos do expo-file-system; no navegador, um Blob.
      if (Platform.OS === "web") form.append("audio", await (await fetch(uri)).blob(), "ideia.webm");
      else form.append("audio", new File(uri) as unknown as Blob, uri.split("/").pop() || "ideia.m4a");
      onText((await transcribe(form)).text);
    } catch (cause) {
      Alert.alert("Transcrição", cause instanceof Error ? cause.message : "Não consegui transcrever o áudio.");
    } finally {
      setState("idle");
    }
  }

  const recording = state === "recording";
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={recording ? "Parar e transcrever" : "Falar a ideia"}
      disabled={disabled || state === "sending"}
      onPress={() => void (recording ? finish() : start().catch((cause) => { setState("idle"); Alert.alert("Microfone", cause instanceof Error ? cause.message : "Não consegui gravar."); }))}
      style={[styles.button, recording && styles.recording, disabled && { opacity: 0.4 }]}
    >
      {state === "sending" ? <ActivityIndicator color={colors.violet300} /> : <Icon name={recording ? "close" : "mic"} size={20} color={recording ? "#FFFFFF" : colors.violet300} strokeWidth={2} />}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: { width: 44, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  recording: { backgroundColor: colors.danger, borderColor: colors.danger },
});
