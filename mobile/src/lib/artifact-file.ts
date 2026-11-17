import { Platform, Share } from "react-native";
import { File, Paths } from "expo-file-system";
import { API_URL } from "./config";
import { authHeaders } from "./api";
import { Alert } from "./alert";

export type FileFormat = "pdf" | "html" | "md";

export const FILE_LABEL: Record<FileFormat, string> = { pdf: "PDF", html: "Página (HTML)", md: "Texto (Markdown)" };

/**
 * Baixa um arquivo de um artefato (src/server/artifacts/export.ts): o salvo pelo id, ou o da conversa pelo código.
 * Web: o navegador baixa. Celular: o arquivo vai para o cache do app e abre a folha de compartilhar do sistema
 * (salvar em Arquivos, mandar por mensagem, abrir em outro app).
 */
export async function saveArtifactFile(environmentId: string, format: FileFormat, artifact: { id?: string; title?: string; format?: string; source?: string }) {
  const response = await fetch(`${API_URL}/api/mobile/env/${encodeURIComponent(environmentId)}/artefatos/exportar`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ formato: format, ...(artifact.id ? { id: artifact.id } : { title: artifact.title, format: artifact.format, source: artifact.source }) }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Não consegui gerar o arquivo agora.");
  }
  return saveResponse(response, `artefato.${format}`);
}

/** Pergunta o formato e baixa (PDF primeiro; Markdown só para documento). Devolve o nome ou lança o erro. */
export function chooseFileFormat(isDocument: boolean): Promise<FileFormat | null> {
  const formats: FileFormat[] = isDocument ? ["pdf", "md", "html"] : ["pdf", "html"];
  return new Promise((resolve) => {
    Alert.alert("Baixar como", "Escolha o tipo de arquivo.", [
      ...formats.map((f) => ({ text: FILE_LABEL[f], onPress: () => resolve(f) })),
      { text: "Cancelar", style: "cancel" as const, onPress: () => resolve(null) },
    ]);
  });
}

/** Salva a resposta como arquivo: web, o navegador baixa; celular, cache do app e a folha de compartilhar. */
async function saveResponse(response: Response, fallbackName: string) {
  const name = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1] ?? fallbackName;
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return name;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(bytes);
  await Share.share(Platform.OS === "ios" ? { url: file.uri, title: name } : { message: file.uri, title: name });
  return name;
}

/**
 * Arquivo que a Kally gerou na conversa (src/server/artifacts/files.ts): já existe no servidor, então só baixa. Os
 * arquivos ficam 24 horas; depois disso, o erro do servidor explica.
 */
export async function downloadKallyFile(environmentId: string, id: string, name: string) {
  const response = await fetch(`${API_URL}/api/mobile/env/${encodeURIComponent(environmentId)}/kally/arquivos/${encodeURIComponent(id)}`, { headers: authHeaders() });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? "Não consegui baixar o arquivo agora.");
  }
  return saveResponse(response, name);
}
