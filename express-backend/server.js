import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fetch from "node-fetch";

// --- Required environment variables (already set in Azure App Service) ---
const {
  AZURE_OPENAI_ENDPOINT,      // e.g. https://pelican-openai.openai.azure.com
  AZURE_OPENAI_API_KEY,       // use Key 1 for now (switch to Managed Identity later)
  AZURE_OPENAI_API_VERSION,   // e.g. 2024-12-01-preview
  AZURE_OPENAI_DEPLOYMENT     // e.g. chat-model
} = process.env;

if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_VERSION || !AZURE_OPENAI_DEPLOYMENT) {
  console.error("❌ Missing required Azure OpenAI environment variables.");
  process.exit(1);
}

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

// --- Health check route ---
app.get("/healthz", (_req, res) => res.status(200).json({ ok: true }));

// --- Minimal chat proxy route ---
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, temperature = 0.2, max_tokens = 1024 } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    const url = `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}`;
    const headers = {
      "Content-Type": "application/json",
      ...(AZURE_OPENAI_API_KEY ? { "api-key": AZURE_OPENAI_API_KEY } : {})
    };

    const payload = { messages, temperature, max_tokens };

    const r = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: data?.error || data });
    }

    res.json({
      reply: data?.choices?.[0]?.message?.content ?? "",
      usage: data?.usage ?? null
    });
  } catch (err) {
    console.error("❌ Error in /api/chat:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// (Optional) Later: serve your built frontend from here.
// import path from "path"; import { fileURLToPath } from "url";
// const __dirname = path.dirname(fileURLToPath(import.meta.url));
// app.use(express.static(path.join(__dirname, "../frontend/dist")));
// app.get("*", (_, res) => res.sendFile(path.join(__dirname, "../frontend/dist/index.html")));

const port = process.env.PORT || 8080;
// --- Serve the built frontend if present ---
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Try Vite (dist) first, then CRA (build)
import fs from "fs";
const viteDist = path.join(__dirname, "../frontend/dist");
const craBuild = path.join(__dirname, "../frontend/build");

if (fs.existsSync(viteDist)) {
  app.use(express.static(viteDist));
  app.get("*", (_req, res) => res.sendFile(path.join(viteDist, "index.html")));
} else if (fs.existsSync(craBuild)) {
  app.use(express.static(craBuild));
  app.get("*", (_req, res) => res.sendFile(path.join(craBuild, "index.html")));
}
app.listen(port, () => console.log(`✅ API listening on http://localhost:${port}`));
