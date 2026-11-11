import { ImageResponse } from "@vercel/og";

// 24-hour countdown PNG. Start timestamp is passed in the URL (`t=<unix>`)
// by the email liquid, so we don't need storage. Every <img> request
// recomputes `remaining = max(0, 86400 - (now - t))`, so each email open
// renders the up-to-date time.

export const config = { runtime: "edge" };

const DURATION_SECONDS = 24 * 3600;

const pad = (n) => String(n).padStart(2, "0");

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const start = Number(url.searchParams.get("t")) || Math.floor(Date.now() / 1000);
  const elapsed = Math.floor(Date.now() / 1000) - start;
  const remaining = Math.max(0, DURATION_SECONDS - elapsed);
  const hh = pad(Math.floor(remaining / 3600));
  const mm = pad(Math.floor((remaining % 3600) / 60));
  const ss = pad(remaining % 60);

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#F2F7F3",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
        }}
      >
        <Cell value={hh} label="HOURS" />
        <Sep />
        <Cell value={mm} label="MINUTES" />
        <Sep />
        <Cell value={ss} label="SECONDS" />
      </div>
    ),
    {
      width: 400,
      height: 80,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      },
    },
  );
};

function Cell({ value, label }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0 14px",
      }}
    >
      <div style={{ fontSize: 42, color: "#2F6E3E", fontWeight: 700, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "#7B766D", letterSpacing: 2, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function Sep() {
  return <div style={{ fontSize: 32, color: "#2F6E3E", fontWeight: 700 }}>:</div>;
}
