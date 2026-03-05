"""
Wan2.1 model wrapper using diffusers.
Handles both base inference and LoRA loading.
"""

import torch
import imageio
import numpy as np
from typing import Optional
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
from transformers import UMT5EncoderModel


MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"


class WanModel:
    def __init__(self):
        dtype = torch.bfloat16

        print(f"Loading VAE from {MODEL_ID}...")
        vae = AutoencoderKLWan.from_pretrained(
            MODEL_ID, subfolder="vae", torch_dtype=torch.float32
        )

        print("Loading pipeline...")
        self.pipe = WanPipeline.from_pretrained(
            MODEL_ID,
            vae=vae,
            torch_dtype=dtype,
        )
        self.pipe.scheduler = UniPCMultistepScheduler.from_config(
            self.pipe.scheduler.config, flow_shift=8.0
        )
        self.pipe.to("cuda")
        print("Wan2.1 1.3B loaded on CUDA.")

        self._loaded_lora: Optional[str] = None

    def _ensure_lora(self, lora_path: Optional[str], lora_scale: float):
        if lora_path != self._loaded_lora:
            # Unload previous LoRA
            if self._loaded_lora is not None:
                self.pipe.unload_lora_weights()

            if lora_path:
                print(f"Loading LoRA from {lora_path}...")
                self.pipe.load_lora_weights(lora_path)
                self.pipe.set_adapters(["default"], adapter_weights=[lora_scale])
            self._loaded_lora = lora_path

    def generate(
        self,
        prompt: str,
        negative_prompt: str = "",
        width: int = 832,
        height: int = 480,
        num_frames: int = 81,
        num_inference_steps: int = 50,
        guidance_scale: float = 6.0,
        lora_path: Optional[str] = None,
        lora_scale: float = 1.0,
        output_path: str = "output.mp4",
    ) -> str:
        self._ensure_lora(lora_path, lora_scale)

        output = self.pipe(
            prompt=prompt,
            negative_prompt=negative_prompt or None,
            height=height,
            width=width,
            num_frames=num_frames,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
        )

        frames = output.frames[0]  # list of PIL images
        frames_np = [np.array(f) for f in frames]

        imageio.mimwrite(output_path, frames_np, fps=16, quality=8)
        return output_path
