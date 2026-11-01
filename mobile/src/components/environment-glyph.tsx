import { View } from "react-native";
import { Image } from "expo-image";
import { readableAccent } from "@shared/color";
import { Icon, type IconName } from "./ui/icon";
import { radius } from "@/theme/tokens";

/** Ícones que um ambiente pode usar (os mesmos aceitos pelo backend). */
export const ENVIRONMENT_ICONS: IconName[] = ["brain", "book", "folder", "bulb", "users", "sparkle", "map", "doc"];

/** "#RRGGBB" + opacidade → "#RRGGBBAA". */
export function withAlpha(hex: string, alpha: number) {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0");
  return /^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${a}` : hex;
}

/** Representação visual de um ambiente: ícone tingido com a cor dele, ou a foto quando houver. */
export function EnvironmentGlyph({ color, icon, image, size = 52 }: { color: string; icon: string; image?: string | null; size?: number }) {
  const name = (ENVIRONMENT_ICONS as string[]).includes(icon) ? (icon as IconName) : "brain";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3 > radius.lg ? radius.lg : size * 0.3,
        backgroundColor: withAlpha(color, 0.14),
        borderWidth: 1,
        borderColor: withAlpha(color, 0.45),
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {image ? (
        <Image source={{ uri: image }} style={{ width: size, height: size }} contentFit="cover" />
      ) : (
        <Icon name={name} size={size * 0.48} color={readableAccent(color)} strokeWidth={1.5} />
      )}
    </View>
  );
}
