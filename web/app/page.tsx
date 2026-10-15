"use client";
 
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/nexus");
  }, [router]);

  return (
    <div className="h-full w-full bg-background flex flex-col justify-center items-center font-mono p-4">
      <div className="p-8 border border-border/60 bg-secondary flex flex-col items-center gap-4 max-w-md w-full">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-400 animate-pulse" />
          <h1 className="text-xs font-mono font-bold tracking-widest uppercase text-emerald-400">
            NEXUS TELEMETRY HUD
          </h1>
        </div>
        <p className="text-xs tracking-wider uppercase text-foreground/60 text-center">
          Initializing Live Company Topology &amp; Decision Graph...
        </p>
      </div>
    </div>
  );
}
