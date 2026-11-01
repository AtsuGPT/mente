import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, UploadFile, File, HTTPException
from faster_whisper import WhisperModel

app = FastAPI()

# faster-whisper (CTranslate2) com int8: o mesmo modelo, várias vezes mais rápido na CPU
# que o openai-whisper. Carrega uma única vez ao iniciar o serviço.
#   WHISPER_MODEL   (padrão medium)   WHISPER_DEVICE (cpu ou cuda)
#   WHISPER_COMPUTE (padrão int8)     WHISPER_BEAM   (padrão 1: decodificação gulosa, mais rápida)
model = WhisperModel(
    os.environ.get("WHISPER_MODEL", "medium"),
    device=os.environ.get("WHISPER_DEVICE", "cpu"),
    compute_type=os.environ.get("WHISPER_COMPUTE", "int8"),
    cpu_threads=int(os.environ.get("WHISPER_THREADS", str(os.cpu_count() or 4))),
)
BEAM_SIZE = int(os.environ.get("WHISPER_BEAM", "1"))
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_SUFFIXES = {".webm", ".mp4", ".m4a", ".ogg", ".wav", ".mp3", ".mpeg", ".aac"}


@app.post("/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    if not audio.filename:
        raise HTTPException(status_code=400, detail="Áudio não enviado")

    suffix = Path(audio.filename).suffix.lower() or ".webm"
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Formato de áudio não compatível")

    temp_path = None
    total_bytes = 0

    try:
        with NamedTemporaryFile(suffix=suffix, delete=False) as temp:
            temp_path = Path(temp.name)

            while chunk := await audio.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > MAX_AUDIO_BYTES:
                    raise HTTPException(status_code=413, detail="O áudio deve ter no máximo 25 MB")
                temp.write(chunk)

        if total_bytes == 0:
            raise HTTPException(status_code=400, detail="Áudio vazio")

        # vad_filter pula os silêncios, que custavam tempo sem trazer texto.
        segments, _info = model.transcribe(
            str(temp_path),
            language="pt",
            beam_size=BEAM_SIZE,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(segment.text.strip() for segment in segments)

        return {"text": text.strip()}

    except HTTPException:
        raise
    except Exception as error:
        print(f"Whisper transcription failed: {error}")
        raise HTTPException(status_code=500, detail="Falha na transcrição") from error

    finally:
        await audio.close()

        if temp_path and temp_path.exists():
            temp_path.unlink()
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
