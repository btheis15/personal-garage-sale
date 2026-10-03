/** The Sell app on your home screen (Safari → Share → Add to Home Screen). */
export function GET() {
  return Response.json(
    {
      name: "Garage Sale: Sell",
      short_name: "Sell",
      start_url: "/sell",
      scope: "/sell",
      display: "standalone",
      background_color: "#f8f7f3",
      theme_color: "#2b4c6f",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon.png", sizes: "512x512", type: "image/png" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
