import { spawn } from "child_process";
import fs from "fs";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function takeScreenshots() {
  const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const chrome = spawn(chromePath, [
    "--headless",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
  ]);

  try {
    // Wait for CDP to be available
    let version = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          version = await res.json();
          break;
        }
      } catch {}
      await sleep(200);
    }

    if (!version) {
      throw new Error("Could not connect to Chrome CDP");
    }

    const targetsRes = await fetch("http://127.0.0.1:9222/json/list");
    const targets = await targetsRes.json();
    const pageTarget = targets.find((t) => t.type === "page") || targets[0];

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

    let msgId = 1;
    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        const handler = (event) => {
          const data = JSON.parse(event.data);
          if (data.id === id) {
            ws.removeEventListener("message", handler);
            resolve(data.result);
          }
        };
        ws.addEventListener("message", handler);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send("Page.enable");
    const targetUrl = process.argv[4] || "http://localhost:3000/nexus";
    await send("Page.navigate", { url: targetUrl });

    // Wait for data to load
    await sleep(2500);

    const sizes = [
      { name: process.argv[2] || "phase-4-1440x900.png", w: 1440, h: 900 },
      { name: process.argv[3] || "phase-4-1920x1080.png", w: 1920, h: 1080 },
    ];

    for (const s of sizes) {
      await send("Emulation.setDeviceMetricsOverride", {
        width: s.w,
        height: s.h,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await sleep(400);

      const shot = await send("Page.captureScreenshot", { format: "png" });
      const buffer = Buffer.from(shot.data, "base64");
      fs.writeFileSync(`docs/img/ui/${s.name}`, buffer);
      console.log(`Saved docs/img/ui/${s.name} (${buffer.length} bytes)`);
    }

    ws.close();
  } finally {
    chrome.kill();
  }
}

takeScreenshots().catch((err) => {
  console.error(err);
  process.exit(1);
});
