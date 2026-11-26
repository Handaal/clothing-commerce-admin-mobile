import { useState } from "react";
import { Platform, StyleSheet, Text, type LayoutChangeEvent, type TextProps } from "react-native";

/** Average advance of a glyph in our bold UI fonts, as a share of the font size (digits ≈ 0.6em). */
const WEB_GLYPH_WIDTH_EM = 0.62;

export type FitTextProps = TextProps & {
  /** Smallest size the text may shrink to, as a share of its styled font size. */
  minimumFontScale?: number;
};

/**
 * One-line text for card figures (money totals, counts) that shrinks its font to fit the card instead
 * of wrapping or spilling past the edge. Below `minimumFontScale` it ellipsizes.
 *
 * iOS and Android use the native `adjustsFontSizeToFit`. react-native-web ignores that prop, so on web
 * the scale is estimated from the laid-out width and the character count.
 */
export function FitText({
  style,
  minimumFontScale = 0.5,
  children,
  onLayout,
  ...rest
}: FitTextProps) {
  const [webScale, setWebScale] = useState(1);

  if (Platform.OS !== "web") {
    return (
      <Text
        {...rest}
        style={style}
        onLayout={onLayout}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={minimumFontScale}
      >
        {children}
      </Text>
    );
  }

  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = typeof flat.fontSize === "number" ? flat.fontSize : 14;
  const lineHeight = typeof flat.lineHeight === "number" ? flat.lineHeight : undefined;
  const characters = textLength(children);

  const handleLayout = (event: LayoutChangeEvent) => {
    onLayout?.(event);
    const width = event.nativeEvent.layout.width;
    if (width <= 0 || characters === 0) return;
    const natural = characters * fontSize * WEB_GLYPH_WIDTH_EM;
    const next = Math.max(minimumFontScale, Math.min(1, width / natural));
    // The text stretches to its card (below), so its width is the room available, not its own
    // content width, and the scale converges in one step. Ignore sub-pixel jitter.
    if (Math.abs(next - webScale) > 0.02) setWebScale(next);
  };

  return (
    <Text
      {...rest}
      numberOfLines={1}
      onLayout={handleLayout}
      style={[
        style,
        styles.stretch,
        webScale < 1 && {
          fontSize: fontSize * webScale,
          ...(lineHeight ? { lineHeight: lineHeight * webScale } : null),
        },
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({ stretch: { alignSelf: "stretch" } });

function textLength(children: TextProps["children"]): number {
  if (typeof children === "string" || typeof children === "number") return String(children).length;
  if (Array.isArray(children))
    return children.reduce<number>((sum, child) => sum + textLength(child), 0);
  return 0;
}
