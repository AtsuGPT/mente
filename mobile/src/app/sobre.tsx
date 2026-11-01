import { ScrollView } from "react-native";
import { about } from "@content/about";
import { AppText } from "@/components/ui/primitives";
import { colors, fonts, space } from "@/theme/tokens";

/** Mesmo texto da página /sobre do site (src/content/about.ts). */
export default function AboutScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: space.xl, paddingBottom: space.xxxl }}>
      <AppText variant="label" color={colors.violet300}>{about.title}</AppText>
      <AppText variant="display" style={{ marginTop: space.md, fontSize: 32, lineHeight: 38 }}>{about.lead}</AppText>
      {about.paragraphs.map((paragraph) => (
        <AppText key={paragraph} variant="body" style={{ marginTop: space.lg }}>{paragraph}</AppText>
      ))}
      <AppText variant="small" color={colors.faint} style={{ marginTop: space.xxl, fontFamily: fonts.serifItalic }}>{about.note}</AppText>
    </ScrollView>
  );
}
