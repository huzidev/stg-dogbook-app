import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
// gifenc is CJS; default-import pattern works under both Vite interop and raw Node ESM.
import gifenc from "gifenc";
const { GIFEncoder, quantize, applyPalette } = gifenc;

// 60-minute animated countdown GIF, rendered per request.
// 60 frames × 60s delay, loopCount=1 (plays once then freezes on last frame).
// The 24h expiration is still computed from ?t=<unix>; the GIF is a visual
// animation only — backend expiration remains authoritative.
// ponytail: 60 satori+resvg frames per request ≈ 7s local / 12-18s Vercel.
// If cold-starts blow past maxDuration=30s, drop to 30 frames.

export const config = { maxDuration: 30 };

const DURATION_SECONDS = 24 * 3600;
const FRAME_COUNT = 60;
const FRAME_DELAY_MS = 60 * 1000;
const WIDTH = 400;
const HEIGHT = 80;
const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff";

let fontPromise;
const getFont = () => {
  if (!fontPromise) fontPromise = fetch(FONT_URL).then((r) => r.arrayBuffer());
  return fontPromise;
};

const pad = (n) => String(n).padStart(2, "0");

const cell = (value, label) => ({
  type: "div",
  props: {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "0 14px",
    },
    children: [
      {
        type: "div",
        props: {
          style: {
            fontSize: 42,
            color: "#2F6E3E",
            fontWeight: 700,
            lineHeight: 1,
          },
          children: value,
        },
      },
      {
        type: "div",
        props: {
          style: {
            fontSize: 10,
            color: "#7B766D",
            letterSpacing: 2,
            marginTop: 4,
          },
          children: label,
        },
      },
    ],
  },
});

const sep = () => ({
  type: "div",
  props: {
    style: { fontSize: 32, color: "#2F6E3E", fontWeight: 700 },
    children: ":",
  },
});

const scene = (hh, mm, ss) => ({
  type: "div",
  props: {
    style: {
      display: "flex",
      width: "100%",
      height: "100%",
      backgroundColor: "#F2F7F3",
      alignItems: "center",
      justifyContent: "center",
    },
    children: [
      cell(hh, "HOURS"),
      sep(),
      cell(mm, "MINUTES"),
      sep(),
      cell(ss, "SECONDS"),
    ],
  },
});

async function frameRgba(remaining, font) {
  const hh = pad(Math.floor(remaining / 3600));
  const mm = pad(Math.floor((remaining % 3600) / 60));
  const ss = pad(remaining % 60);
  const svg = await satori(scene(hh, mm, ss), {
    width: WIDTH,
    height: HEIGHT,
    fonts: [{ name: "Inter", data: font, weight: 700, style: "normal" }],
  });
  return new Resvg(svg).render().pixels;
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const tRaw = Number(url.searchParams.get("t"));
  const nowSec = Math.floor(Date.now() / 1000);
  const start =
    Number.isFinite(tRaw) && tRaw > 0 && tRaw <= nowSec + 60 ? tRaw : nowSec;
  const expiresAt = start + DURATION_SECONDS;

  const font = await getFont();
  const enc = GIFEncoder();
  let palette;

  for (let i = 0; i < FRAME_COUNT; i++) {
    const remaining = Math.max(0, expiresAt - (nowSec + i * 60));
    const rgba = await frameRgba(remaining, font);
    const data = new Uint8ClampedArray(
      rgba.buffer,
      rgba.byteOffset,
      rgba.byteLength,
    );
    if (!palette) palette = quantize(data, 64);
    const indexed = applyPalette(data, palette);
    // gifenc: repeat=-1 on first frame omits the NETSCAPE loop extension →
    // the GIF plays through once and freezes on the last frame.
    enc.writeFrame(indexed, WIDTH, HEIGHT, {
      palette: i === 0 ? palette : undefined,
      delay: FRAME_DELAY_MS,
      repeat: i === 0 ? -1 : undefined,
    });
    if (remaining === 0) break;
  }
  enc.finish();

  return new Response(enc.bytes(), {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
};
