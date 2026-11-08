import { ScrollView, View } from "react-native";
import { about } from "@content/about";
import { useCurrentEnvironment } from "@/lib/environment";
import { EnvironmentGlyph } from "@/components/environment-glyph";
import { AppText } from "@/components/ui/primitives";
import { colors, fonts, space } from "@/theme/tokens";
import { useContainer } from "@/theme/layout";

/** No ambiente original, o mesmo texto da página /sobre do site; nos outros, a descrição do ambiente. */
export default function AboutScreen() {
  const container = useContainer("reading");
  const { environment, session } = useCurrentEnvironment();

  if (environment.id !== "mente") {
    return (
      <ScrollView contentContainerStyle={[{ padding: space.xl, paddingBottom: space.xxxl, gap: space.lg }, container]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <EnvironmentGlyph color={environment.color} icon={environment.icon} image={session.image} size={56} />
          <AppText variant="display" style={{ flex: 1, fontSize: 30, lineHeight: 36 }}>{environment.name}</AppText>
        </View>
        <AppText variant="body" color={environment.description ? colors.text : colors.muted}>
          {environment.description || "Este ambiente ainda não tem uma descrição."}
        </AppText>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[{ padding: space.xl, paddingBottom: space.xxxl }, container]}>
      <AppText variant="label" color={colors.violet300}>{about.title}</AppText>
      <AppText variant="display" style={{ marginTop: space.md, fontSize: 32, lineHeight: 38 }}>{about.lead}</AppText>
      {about.paragraphs.map((paragraph) => (
        <AppText key={paragraph} variant="body" style={{ marginTop: space.lg }}>{paragraph}</AppText>
      ))}
      <AppText variant="small" color={colors.faint} style={{ marginTop: space.xxl, fontFamily: fonts.serifItalic }}>{about.note}</AppText>
    </ScrollView>
  );
}
