import "@fontsource/press-start-2p/400.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "@fontsource/atkinson-hyperlegible-mono/400.css";
import "@fontsource/atkinson-hyperlegible-mono/600.css";
import "./nexus.css";

export default function NexusLayout({ children }: { children: React.ReactNode }) {
  return <div className="nx">{children}</div>;
}
