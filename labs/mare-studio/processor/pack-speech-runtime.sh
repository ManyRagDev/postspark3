#!/usr/bin/env bash
# Build the lab's isolated Ubuntu 22.04 x64 / Python 3.10 runtime.
set -euo pipefail
speech_stage=$(mktemp -d)
trap 'rm -rf -- "$speech_stage"' EXIT
mkdir -p "$speech_stage/models/whisper-base"
uv pip install --python /usr/bin/python3 --python-version 3.10 --python-platform x86_64-manylinux_2_35 \
  --only-binary :all: --target "$speech_stage/lib" \
  faster-whisper==1.2.1 ctranslate2==4.9.1 ai-edge-litert==1.4.0 av==17.1.0 \
  imageio-ffmpeg==0.6.0 numpy==1.26.4 onnxruntime==1.22.1
ln -s lib/imageio_ffmpeg/binaries/ffmpeg-linux-x86_64-v7.0.2 "$speech_stage/ffmpeg"
test -x "$speech_stage/ffmpeg"

whisper_rev=ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66
for model_file in config.json tokenizer.json vocabulary.txt model.bin; do
  weight="whisper-base/$model_file"
  if [[ -n "${MARE_SPEECH_MODEL_CACHE:-}" && -r "$MARE_SPEECH_MODEL_CACHE/$weight" ]]; then
    cp -- "$MARE_SPEECH_MODEL_CACHE/$weight" "$speech_stage/models/$weight"
  else
    curl -fLsS --retry 2 "https://huggingface.co/Systran/faster-whisper-base/resolve/$whisper_rev/$model_file?download=true" \
      -o "$speech_stage/models/$weight"
  fi
done
if [[ -n "${MARE_SPEECH_MODEL_CACHE:-}" && -r "$MARE_SPEECH_MODEL_CACHE/selfie.tflite" ]]; then
  cp -- "$MARE_SPEECH_MODEL_CACHE/selfie.tflite" "$speech_stage/models/selfie.tflite"
else
  curl -fLsS --retry 2 https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite \
    -o "$speech_stage/models/selfie.tflite"
fi
(
  cd "$speech_stage/models"
  sha256sum -c --status <<'EOF'
191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b  selfie.tflite
56a6d8110d311f19c8f0471e562832c7527f146b567275bfca59fcf7c184da9a  whisper-base/config.json
d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9  whisper-base/model.bin
fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab  whisper-base/tokenizer.json
34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913  whisper-base/vocabulary.txt
EOF
)
tar -czf - -C "$speech_stage" .
