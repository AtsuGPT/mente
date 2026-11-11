import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";
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
  | "stop"
  | "refresh"
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
  | "settings"
  | "brain"
  | "book"
  | "bulb"
  | "users"
  | "key"
  | "share"
  | "swap"
  | "mic"
  | "clock"
  | "globe"
  | "clip"
  | "kally"
  | "table"
  | "flow"
  | "copy"
  | "expand";

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
      {name === "stop" && <Rect x={7} y={7} width={10} height={10} rx={2} fill={color} stroke="none" />}
      {name === "refresh" && <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4.2h-4.2" {...p} />}
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
      {name === "brain" && (
        <>
          <Path d="M9.5 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 18a2.8 2.8 0 0 0 3 2.5V4.5ZM14.5 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2 3 3 0 0 1-2 5.3 2.8 2.8 0 0 1-3 2.5V4.5Z" {...p} />
          <Path d="M9.5 9H8M9.5 14H7.5M14.5 9H16M14.5 14h2" {...p} />
        </>
      )}
      {name === "book" && <Path d="M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2Zm0 0v13" {...p} />}
      {name === "bulb" && <Path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3.5Z" {...p} />}
      {name === "users" && (
        <>
          <Circle cx={9} cy={8.5} r={3.2} {...p} />
          <Path d="M3.5 19c.8-3 2.9-4.6 5.5-4.6s4.7 1.6 5.5 4.6M15.5 5.6a3 3 0 0 1 0 5.8M17 14.6c1.8.5 3 1.9 3.5 4.4" {...p} />
        </>
      )}
      {name === "key" && (
        <>
          <Circle cx={8} cy={15} r={3.5} {...p} />
          <Path d="m10.5 12.5 8-8M16 7l2.5 2.5M14 9l2 2" {...p} />
        </>
      )}
      {name === "share" && <Path d="M12 15V4m0 0L8 8m4-4 4 4M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" {...p} />}
      {name === "swap" && <Path d="M7 7h12m0 0-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0 3.5-3.5M5 17l3.5 3.5" {...p} />}
      {name === "mic" && <Path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" {...p} />}
      {name === "clock" && <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2" {...p} />}
      {name === "globe" && <Path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" {...p} />}
      {name === "clip" && <Path d="m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" {...p} />}
      {name === "kally" && (
        // O símbolo orbital da Kally em traço fino: três órbitas nas inclinações da órbita
        // animada e o núcleo de luz (legível a partir de 16 px).
        <>
          <Ellipse cx={12} cy={12} rx={10.2} ry={3.5} transform="rotate(18 12 12)" {...p} />
          <Ellipse cx={12} cy={12} rx={8.6} ry={3.1} transform="rotate(116 12 12)" {...p} strokeOpacity={0.75} />
          <Ellipse cx={12} cy={12} rx={6.8} ry={2.6} transform="rotate(-36 12 12)" {...p} strokeOpacity={0.55} />
        </>
      )}
      {name === "table" && (
        <>
          <Rect x={3.5} y={4.5} width={17} height={15} rx={2} {...p} />
          <Path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10" {...p} />
        </>
      )}
      {name === "flow" && (
        <>
          <Rect x={8} y={3} width={8} height={5} rx={1.5} {...p} />
          <Rect x={3} y={16} width={7} height={5} rx={1.5} {...p} />
          <Rect x={14} y={16} width={7} height={5} rx={1.5} {...p} />
          <Path d="M12 8v4M6.5 16v-2.5h11V16M12 12v1.5" {...p} />
        </>
      )}
      {name === "copy" && (
        <>
          <Rect x={8.5} y={8.5} width={11} height={11} rx={2} {...p} />
          <Path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" {...p} />
        </>
      )}
      {name === "expand" && <Path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" {...p} />}
    </Svg>
  );
}
