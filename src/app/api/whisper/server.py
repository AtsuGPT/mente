
from pathlib import Path
from tempfile import NamedTemporaryFile

import whisper
from fastapi import FastAPI, UploadFile, File, HTTPException

app = FastAPI()

# Carrega o modelo uma única vez ao iniciar o serviço.
model = whisper.load_model("medium")
MAX_AUDIO_BYTES = 25 * 1024 * 1024
ALLOWED_SUFFIXES = {".webm", ".mp4", ".m4a", ".ogg", ".wav", ".mp3", ".mpeg"}


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

        result = model.transcribe(
            str(temp_path),
            language="pt",
            fp16=False
        )

        return {"text": result["text"].strip()}

    except HTTPException:
        raise
    except Exception as error:
        print(f"Whisper transcription failed: {error}")
        raise HTTPException(status_code=500, detail="Falha na transcrição") from error

    finally:
        await audio.close()

        if temp_path and temp_path.exists():
            temp_path.unlink()
