import { createCaptureApp } from "./app";

const { app, close } = createCaptureApp(
  process.env.SCREENSHOT_SERVICE_TOKEN ?? ""
);
const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
  console.log(
    "[capture] ready; authenticated capture, public destinations only"
  )
);
server.requestTimeout = 90_000;
server.headersTimeout = 10_000;
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close();
    void close().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
