"""
Wan2.1 local inference server.
Exposes a simple REST API that the Next.js dashboard calls.
Run with: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

import uuid
import asyncio
import os
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from wan_model import WanModel

app = FastAPI(title="brainrot-wan-server")

# Output dir for generated videos (served statically)
OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# Job store (in-memory; fine for a single machine)
jobs: dict[str, dict] = {}

# Single thread executor so GPU doesn't get double-booked
executor = ThreadPoolExecutor(max_workers=1)

# Load model once at startup
model: Optional[WanModel] = None

@app.on_event("startup")
async def startup():
    global model
    print("Loading Wan2.1 model...")
    model = WanModel()
    print("Model ready.")


class GenerateRequest(BaseModel):
    prompt: str
    negative_prompt: str = ""
    width: int = 832
    height: int = 480
    num_frames: int = 81
    num_inference_steps: int = 50
    guidance_scale: float = 6.0
    lora_path: Optional[str] = None
    lora_scale: float = 1.0


@app.post("/generate")
async def generate(req: GenerateRequest, background_tasks: BackgroundTasks):
    task_id = str(uuid.uuid4())
    jobs[task_id] = {"status": "queued", "progress": 0}

    background_tasks.add_task(_run_generation, task_id, req)
    return {"task_id": task_id}


@app.get("/status/{task_id}")
async def status(task_id: str):
    if task_id not in jobs:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"task_id": task_id, **jobs[task_id]}


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": model is not None}


async def _run_generation(task_id: str, req: GenerateRequest):
    jobs[task_id]["status"] = "processing"
    loop = asyncio.get_event_loop()
    try:
        output_path = await loop.run_in_executor(
            executor,
            lambda: model.generate(  # type: ignore
                prompt=req.prompt,
                negative_prompt=req.negative_prompt,
                width=req.width,
                height=req.height,
                num_frames=req.num_frames,
                num_inference_steps=req.num_inference_steps,
                guidance_scale=req.guidance_scale,
                lora_path=req.lora_path,
                lora_scale=req.lora_scale,
                output_path=str(OUTPUT_DIR / f"{task_id}.mp4"),
            ),
        )
        base_url = os.environ.get("SERVER_BASE_URL", "http://localhost:8000")
        jobs[task_id] = {
            "status": "completed",
            "video_url": f"{base_url}/outputs/{task_id}.mp4",
            "progress": 100,
        }
    except Exception as e:
        jobs[task_id] = {"status": "failed", "error": str(e), "progress": 0}
