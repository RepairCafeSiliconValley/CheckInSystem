import stackedLogo from "../assets/RCSV.svg";
import horizontalLogo from "../assets/RCSV_horizontal_color.svg";

export default function Logo({ size = "normal", variant = "stacked" }) {
  const h = size === "small" ? 28 : size === "tiny" ? 20 : variant === "horizontal" ? 56 : 72;
  const src = variant === "horizontal" ? horizontalLogo : stackedLogo;
  return (
    <img
      src={src}
      alt="Repair Cafe Silicon Valley"
      style={{ height: h, width: "auto", display: "block" }}
    />
  );
}
