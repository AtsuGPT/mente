import { Platform } from "react-native";
import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

/**
 * Arquivo escolhido na galeria, pronto para FormData.
 * No iOS/Android o fetch global é o expo/fetch, que não aceita o formato
 * { uri, name, type } do React Native: ele lê objetos com bytes(), como o File
 * do expo-file-system. No navegador (testes) usa um Blob comum.
 */
export async function uploadablePart(asset: ImagePicker.ImagePickerAsset): Promise<{ part: Blob; name: string }> {
  const name = asset.fileName || `imagem.${asset.mimeType?.split("/")[1] ?? "jpg"}`;
  if (Platform.OS === "web") return { part: await (await fetch(asset.uri)).blob(), name };
  return { part: new File(asset.uri) as unknown as Blob, name };
}

/** Abre a galeria (só imagens). Devolve null se a pessoa cancelar. */
export async function pickImage(): Promise<ImagePicker.ImagePickerAsset | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted && permission.accessPrivileges !== "limited") {
    throw new Error("Permita o acesso às fotos para inserir imagens.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: false });
  return result.canceled ? null : result.assets[0] ?? null;
}
