import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0D0D0D 0%, #1A1A2E 100%)",
          borderRadius: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 200,
              fontWeight: 900,
              color: "#C9A84C",
              lineHeight: 1,
            }}
          >
            e
          </span>
          <span
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#C9A84C",
              letterSpacing: 4,
              opacity: 0.8,
            }}
          >
            P
          </span>
        </div>
      </div>
    ),
    { ...size },
  );
}
