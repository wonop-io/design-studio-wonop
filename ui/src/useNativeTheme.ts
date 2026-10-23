import { useEffect, useState } from "react";
/** Runtime surface tokens are authoritative; system media is the fallback for
 * the standalone browser fixture. The same theme is applied to captured HTML. */
function readTheme(): "light" | "dark" {
  const color = getComputedStyle(document.documentElement).getPropertyValue(
    "--wm-content",
  ).trim();
  const rgb = color.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  const values = rgb
    ? rgb.slice(1, 4).map(Number)
    : hex
    ? [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16))
    : null;
  return values
    ? (values[0] * .2126 + values[1] * .7152 + values[2] * .0722 < 128
      ? "dark"
      : "light")
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}
export function useNativeTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const update = () => setTheme(readTheme()),
      media = matchMedia("(prefers-color-scheme: dark)"),
      observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
    };
  }, []);
  return theme;
}
