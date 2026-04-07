/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md",
  generateRobotsTxt: true,
  exclude: ["/admin/*", "/dashboard/*", "/sign-in*", "/sign-up*", "/api/*"],
  robotsTxtOptions: {
    additionalSitemaps: [],
    policies: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/dashboard", "/api", "/sign-in", "/sign-up"],
      },
    ],
  },
  alternateRefs: [
    { href: "https://epetrecere.md", hreflang: "ro" },
    { href: "https://epetrecere.md", hreflang: "ru" },
    { href: "https://epetrecere.md", hreflang: "en" },
  ],
};
