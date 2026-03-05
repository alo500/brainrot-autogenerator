"""
LoRA fine-tuning for Wan2.1 using diffusers + PEFT.

Usage:
  python train/train_lora.py \
    --data_dir ./training_data \
    --output_dir ./lora_weights/my_style \
    --steps 500 \
    --rank 32

Training data format:
  training_data/
    video1.mp4  +  video1.txt  (prompt describing video1)
    video2.mp4  +  video2.txt
    ...
"""

import argparse
import os
from pathlib import Path

import torch
from diffusers import WanPipeline, AutoencoderKLWan
from peft import LoraConfig, get_peft_model
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
from transformers import get_cosine_schedule_with_warmup
import imageio
import numpy as np


MODEL_ID = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"


class VideoTextDataset(Dataset):
    def __init__(self, data_dir: str):
        self.data_dir = Path(data_dir)
        self.pairs = []

        for video_file in sorted(self.data_dir.glob("*.mp4")):
            txt_file = video_file.with_suffix(".txt")
            if txt_file.exists():
                self.pairs.append((video_file, txt_file))

        print(f"Found {len(self.pairs)} video-text pairs.")

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        video_path, txt_path = self.pairs[idx]
        prompt = txt_path.read_text().strip()
        # Load first 81 frames (5s at 16fps)
        reader = imageio.get_reader(str(video_path))
        frames = []
        for i, frame in enumerate(reader):
            if i >= 81:
                break
            frames.append(frame)
        reader.close()

        # Pad to 81 frames if shorter
        while len(frames) < 81:
            frames.append(frames[-1])

        frames_np = np.stack(frames)  # (T, H, W, C)
        frames_t = torch.tensor(frames_np, dtype=torch.float32).permute(0, 3, 1, 2) / 127.5 - 1
        return {"frames": frames_t, "prompt": prompt}


def train(args):
    print(f"Loading Wan2.1 for LoRA fine-tuning...")
    vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(MODEL_ID, vae=vae, torch_dtype=torch.bfloat16)
    pipe.to("cuda")

    transformer = pipe.transformer

    lora_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.rank,
        target_modules=["to_q", "to_k", "to_v", "to_out.0"],
        lora_dropout=0.05,
    )
    transformer = get_peft_model(transformer, lora_config)
    transformer.print_trainable_parameters()

    dataset = VideoTextDataset(args.data_dir)
    loader = DataLoader(dataset, batch_size=1, shuffle=True)

    optimizer = AdamW(transformer.parameters(), lr=args.lr)
    scheduler = get_cosine_schedule_with_warmup(
        optimizer, num_warmup_steps=50, num_training_steps=args.steps
    )

    transformer.train()
    step = 0
    loss_log = []

    while step < args.steps:
        for batch in loader:
            if step >= args.steps:
                break

            prompts = batch["prompt"]
            # Encode text
            with torch.no_grad():
                text_embeds = pipe._encode_prompt(prompts, device="cuda", num_images_per_prompt=1)[0]

            # Encode video to latents
            frames = batch["frames"].to("cuda", dtype=torch.float32)
            with torch.no_grad():
                latents = vae.encode(frames.squeeze(0)).latent_dist.sample() * vae.config.scaling_factor

            # Add noise
            noise = torch.randn_like(latents)
            t = torch.randint(0, 1000, (1,), device="cuda")
            noisy_latents = latents + noise * (t.float() / 1000)

            pred = transformer(
                hidden_states=noisy_latents.unsqueeze(0),
                encoder_hidden_states=text_embeds,
                timestep=t,
            ).sample

            loss = torch.nn.functional.mse_loss(pred, noise.unsqueeze(0))
            loss.backward()
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()

            step += 1
            loss_log.append(loss.item())

            if step % 50 == 0:
                avg = sum(loss_log[-50:]) / 50
                print(f"Step {step}/{args.steps} — loss: {avg:.4f}")

    # Save LoRA weights
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    transformer.save_pretrained(str(output_dir))
    print(f"LoRA saved to {output_dir}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", required=True)
    parser.add_argument("--output_dir", default="./lora_weights/custom")
    parser.add_argument("--steps", type=int, default=500)
    parser.add_argument("--rank", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4)
    args = parser.parse_args()
    train(args)
