import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

// 24-hour countdown PNG. Start timestamp passed in URL (`t=<unix>`) so no
// storage needed. Each email open re-renders with fresh remaining time.
// ponytail: font fetched once at cold start; add bundled font if cold
// starts get slow enough that the ~100ms fetch matters.

const DURATION_SECONDS = 24 * 3600;
const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/inter/files/inter-latin-700-normal.woff";

let fontPromise;
const getFont = () => {
  if (!fontPromise) {
    fontPromise = fetch(FONT_URL).then((r) => r.arrayBuffer());
  }
  return fontPromise;
};

const pad = (n) => String(n).padStart(2, "0");

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const start =
    Number(url.searchParams.get("t")) || Math.floor(Date.now() / 1000);
  const elapsed = Math.floor(Date.now() / 1000) - start;
  const remaining = Math.max(0, DURATION_SECONDS - elapsed);
  const hh = pad(Math.floor(remaining / 3600));
  const mm = pad(Math.floor((remaining % 3600) / 60));
  const ss = pad(remaining % 60);

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

  const sep = {
    type: "div",
    props: {
      style: { fontSize: 32, color: "#2F6E3E", fontWeight: 700 },
      children: ":",
    },
  };

  const node = {
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
      children: [cell(hh, "HOURS"), sep, cell(mm, "MINUTES"), sep, cell(ss, "SECONDS")],
    },
  };

  const font = await getFont();
  const svg = await satori(node, {
    width: 400,
    height: 80,
    fonts: [{ name: "Inter", data: font, weight: 700, style: "normal" }],
  });
  const png = new Resvg(svg).render().asPng();

  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  });
};
