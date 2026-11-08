import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet } from "react-native";
import { File } from "expo-file-system";
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from "expo-audio";
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Touchable } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icon";
import { levelFromMetering } from "@/components/kally/activity";
import { spring, timing } from "@/theme/motion";
import { colors, radius } from "@/theme/tokens";

/**
 * Grava a fala e devolve a transcrição bruta (Whisper no servidor), para a pessoa
 * revisar e editar antes de enviar. Um toque começa, outro termina.
 *
 * Com medição ligada, o nível real do microfone (~12 vezes por segundo) é repassado em
 * onLevel: a órbita da Kally reage à voz no estado "escutando".
 */
export function VoiceButton({
  transcribe,
  onText,
  disabled,
  onLevel,
  onRecordingChange,
}: {
  transcribe: (form: FormData) => Promise<{ text: string }>;
  onText: (text: string) => void;
  disabled?: boolean;
  onLevel?: (level: number) => void;
  onRecordingChange?: (recording: boolean) => void;
}) {
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const recording = state === "recording";

  useEffect(() => {
    onRecordingChange?.(recording);
    if (!recording) onLevel?.(0);
  }, [recording, onRecordingChange, onLevel]);

  // Gravando: o botão fica vermelho e respira com a voz.
  const on = useSharedValue(0);
  const voice = useSharedValue(0);
  useEffect(() => {
    on.value = withTiming(recording ? 1 : 0, timing.short);
  }, [recording, on]);
  // Lê o nível do microfone só enquanto grava (fora disso, nada fica consultando o gravador)
  // e o entrega direto à animação e à órbita, sem estado do React a cada leitura.
  useEffect(() => {
    if (!recording) {
      voice.value = withSpring(0, spring.press);
      return;
    }
    const id = setInterval(() => {
      const level = levelFromMetering(recorder.getStatus().metering);
      onLevel?.(level);
      voice.value = withSpring(level, spring.press);
    }, 80);
    return () => clearInterval(id);
  }, [recording, recorder, onLevel, voice]);
  const look = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], ["rgba(21,16,38,0.7)", colors.danger]),
    borderColor: interpolateColor(on.value, [0, 1], [colors.lineStrong, colors.danger]),
    transform: [{ scale: 1 + voice.value * 0.12 }],
  }));

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

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={recording ? "Parar e transcrever" : "Falar a ideia"}
      disabled={disabled || state === "sending"}
      haptic
      pressScale={0.9}
      onPress={() => void (recording ? finish() : start().catch((cause) => { setState("idle"); Alert.alert("Microfone", cause instanceof Error ? cause.message : "Não consegui gravar."); }))}
      style={[styles.button, disabled && { opacity: 0.4 }]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.fill, look]} />
      {state === "sending" ? <ActivityIndicator color={colors.violet300} /> : <Icon name={recording ? "close" : "mic"} size={19} color={recording ? "#FFFFFF" : colors.violet300} strokeWidth={2} />}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  button: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  fill: { borderRadius: radius.pill, borderWidth: 1 },
});
