import "@fontsource/press-start-2p/400.css";
import "@fontsource/pixelify-sans/400.css";
import "@fontsource/pixelify-sans/600.css";
import "@fontsource/vt323/400.css";
import "./nexus.css";

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return <div className="nx">{children}</div>;
}
