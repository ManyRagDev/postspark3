# Reuse the deployed, frozen Node runtime; no new registry dependencies or app rollout.
ARG BASE_IMAGE=postspark-trial:local
FROM ${BASE_IMAGE}
WORKDIR /app
COPY service.mjs /app/image-editor-service.mjs
ENV IMAGE_PROCESSOR_HOST=0.0.0.0 IMAGE_PROCESSOR_PORT=9417 PHOTOCRAFT_BIN=/opt/postspark/photocraft/current/photocraft-cli PHOTOCRAFT_WORK_ROOT=/tmp/image-editor
USER node
ENTRYPOINT []
CMD ["node", "/app/image-editor-service.mjs"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:9417/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
