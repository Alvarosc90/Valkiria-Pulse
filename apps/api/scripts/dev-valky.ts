process.env.PORT ||= "4101";
process.env.APP_URL ||= "http://127.0.0.1:5175";
process.env.API_URL ||= "http://127.0.0.1:4101";
process.env.CORS_ORIGIN ||= "http://127.0.0.1:5175";
process.env.OAUTH_PUBLIC_BASE_URL ||= "http://127.0.0.1:4101";

await import("../src/server.js");
