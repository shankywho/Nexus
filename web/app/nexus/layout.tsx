import "@fontsource/silkscreen/400.css";
import "@fontsource/silkscreen/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./nexus.css";

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return <div className="nx">{children}</div>;
}
