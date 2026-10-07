import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: 180, height: 180, background: "#1f1e1c", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            width: 84,
            height: 140,
            background: "#e9dcc2",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: 22,
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#1f1e1c", marginBottom: 40 }} />
          <div style={{ width: 40, height: 40, borderRadius: 20, border: "4px solid #a78a5a" }} />
        </div>
      </div>
    ),
    size,
  );
}
