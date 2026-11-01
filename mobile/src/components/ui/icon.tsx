import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors } from "@/theme/tokens";

/** Ícones de linha fina, no mesmo traço dos ícones do site (stroke 1.6). */

export type IconName =
  | "home"
  | "search"
  | "map"
  | "chat"
  | "user"
  | "plus"
  | "minus"
  | "back"
  | "close"
  | "edit"
  | "image"
  | "trash"
  | "link"
  | "lock"
  | "folder"
  | "doc"
  | "eye"
  | "check"
  | "target"
  | "send"
  | "sparkle"
  | "logout"
  | "settings";

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.6 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  const p = { stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "home" && <Path d="m3.5 10 8.5-7 8.5 7v10.5h-6v-7h-5v7h-6V10Z" {...p} />}
      {name === "search" && (
        <>
          <Circle cx={10.8} cy={10.8} r={6.8} {...p} />
          <Path d="m16 16 4.5 4.5" {...p} />
        </>
      )}
      {name === "map" && (
        <>
          <Circle cx={6} cy={7} r={2.4} {...p} />
          <Circle cx={18} cy={6} r={2} {...p} />
          <Circle cx={12} cy={17.5} r={2.8} {...p} />
          <Path d="M8.2 8.2 10.4 15M16.6 7.6l-3.4 7.6M8.4 6.8l7.6-.6" {...p} />
        </>
      )}
      {name === "chat" && (
        <>
          <Path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-6a7.5 7.5 0 1 1 17-3.5Z" {...p} />
          <Path d="M8 11h8M8 14h5" {...p} />
        </>
      )}
      {name === "user" && (
        <>
          <Circle cx={12} cy={8.5} r={4} {...p} />
          <Path d="M4.5 20.5c1.3-3.6 4-5.5 7.5-5.5s6.2 1.9 7.5 5.5" {...p} />
        </>
      )}
      {name === "plus" && <Path d="M12 5v14M5 12h14" {...p} />}
      {name === "minus" && <Path d="M5 12h14" {...p} />}
      {name === "back" && <Path d="M15 5 8 12l7 7" {...p} />}
      {name === "close" && <Path d="M6 6l12 12M18 6 6 18" {...p} />}
      {name === "edit" && <Path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" {...p} />}
      {name === "image" && (
        <>
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2} {...p} />
          <Circle cx={9} cy={10} r={1.6} {...p} />
          <Path d="m20.5 16-5-5-8 8.5" {...p} />
        </>
      )}
      {name === "trash" && <Path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 13h9l1-13M9.5 7V4.5h5V7" {...p} />}
      {name === "link" && <Path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...p} />}
      {name === "lock" && (
        <>
          <Rect x={5} y={10.5} width={14} height={10} rx={2} {...p} />
          <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...p} />
        </>
      )}
      {name === "folder" && (
        <>
          <Path d="M3 6.5h7l2 2h9v9.8a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 18.3V6.5Z" {...p} />
          <Path d="M3.5 10h17" {...p} />
        </>
      )}
      {name === "doc" && <Path d="M7 3.5h7l4.5 4.5v12.5h-11.5V3.5ZM14 3.5V8h4.5M9.5 12.5h6M9.5 16h4" {...p} />}
      {name === "eye" && (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...p} />
          <Circle cx={12} cy={12} r={3} {...p} />
        </>
      )}
      {name === "check" && <Path d="m5 12.5 4.5 4.5L19 7.5" {...p} />}
      {name === "target" && (
        <>
          <Circle cx={12} cy={12} r={7.5} {...p} />
          <Circle cx={12} cy={12} r={2.2} {...p} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...p} />
        </>
      )}
      {name === "send" && <Path d="M12 19V5m0 0-5.5 5.5M12 5l5.5 5.5" {...p} />}
      {name === "sparkle" && <Path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2L12 3.5Z" {...p} />}
      {name === "logout" && <Path d="M14 4.5H6.5v15H14M10.5 12H20m0 0-3.5-3.5M20 12l-3.5 3.5" {...p} />}
      {name === "settings" && (
        <>
          <Circle cx={12} cy={12} r={3} {...p} />
          <Path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" {...p} />
        </>
      )}
    </Svg>
  );
}
