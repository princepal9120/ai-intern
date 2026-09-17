#!/usr/bin/env python3
"""
Theme Analyzer: Reverse engineer design systems, color palettes, line art styles,
and generative AI prompts from a directory of theme images or single assets.
"""

import os
import sys
import json
import argparse
from pathlib import Path
from collections import Counter
from PIL import Image

def hex_color(rgb):
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"

def analyze_image(path):
    try:
        im = Image.open(path)
    except Exception as e:
        return {"error": str(e), "path": str(path)}
    
    w, h = im.size
    mode = im.mode
    has_alpha = "A" in mode or (mode == "P" and "transparency" in im.info)
    
    # Convert to RGBA for consistent analysis
    rgba_im = im.convert("RGBA")
    small = rgba_im.resize((100, 100))
    pixels = list(small.getdata())
    
    # Filter transparent pixels
    visible_pixels = [p[:3] for p in pixels if p[3] > 30]
    total_visible = len(visible_pixels)
    
    if total_visible == 0:
        return {
            "name": os.path.basename(path),
            "dimensions": [w, h],
            "aspect_ratio": round(w / h, 2),
            "has_alpha": has_alpha,
            "format": im.format
        }
    
    # Identify background / canvas color
    corners = [
        pixels[0][:3], pixels[99][:3],
        pixels[9900][:3], pixels[9999][:3]
    ]
    corner_hex = [hex_color(c) for c in corners]
    
    # Color quantization (cluster similar colors)
    color_counts = Counter()
    for r, g, b in visible_pixels:
        qr, qg, qb = (r // 16) * 16, (g // 16) * 16, (b // 16) * 16
        color_counts[(qr, qg, qb)] += 1
    
    dominant_clusters = []
    for (r, g, b), cnt in color_counts.most_common(12):
        freq = round(cnt / total_visible, 3)
        dominant_clusters.append({
            "hex": hex_color((r, g, b)),
            "frequency": freq,
            "rgb": [r, g, b]
        })
        
    # Check grayscale vs saturated
    grayscale_count = sum(
        cnt for (r, g, b), cnt in color_counts.items()
        if abs(r - g) < 18 and abs(g - b) < 18
    )
    grayscale_ratio = round(grayscale_count / total_visible, 2)
    
    # Detect black ink stroke presence
    black_ink_count = sum(
        cnt for (r, g, b), cnt in color_counts.items()
        if r < 40 and g < 40 and b < 40
    )
    has_ink_outlines = (black_ink_count / total_visible) > 0.03
    
    return {
        "name": os.path.basename(path),
        "path": str(path),
        "format": im.format,
        "dimensions": [w, h],
        "aspect_ratio": round(w / h, 2),
        "has_alpha": has_alpha,
        "grayscale_ratio": grayscale_ratio,
        "has_ink_outlines": has_ink_outlines,
        "dominant_colors": dominant_clusters[:6]
    }

def analyze_directory(dir_path):
    p = Path(dir_path)
    image_exts = {".webp", ".png", ".jpg", ".jpeg", ".svg"}
    files = sorted([f for f in p.iterdir() if f.suffix.lower() in image_exts])
    
    results = []
    global_palette = Counter()
    total_images = len(files)
    
    raster_images = []
    svg_files = []
    
    for f in files:
        if f.suffix.lower() == ".svg":
            svg_files.append(f.name)
            continue
        data = analyze_image(f)
        if "error" not in data:
            raster_images.append(data)
            for col in data.get("dominant_colors", []):
                rgb = tuple(col["rgb"])
                global_palette[rgb] += int(col["frequency"] * 100)
    
    # Synthesize theme style
    overall_ink = any(img.get("has_ink_outlines") for img in raster_images)
    avg_gray = sum(img.get("grayscale_ratio", 0) for img in raster_images) / max(len(raster_images), 1)
    
    # Top theme colors
    top_theme_colors = []
    for rgb, score in global_palette.most_common(10):
        top_theme_colors.append(hex_color(rgb))
        
    theme_profile = {
        "directory": str(p.resolve()),
        "asset_count": total_images,
        "raster_count": len(raster_images),
        "svg_count": len(svg_files),
        "style_characteristics": {
            "uses_black_ink_outlines": overall_ink,
            "average_grayscale_ratio": round(avg_gray, 2),
            "aesthetic_classification": "Manga / Comic Line Art & Halftone Cel" if overall_ink else "Modern Flat Digital",
            "top_theme_colors": top_theme_colors,
            "svg_assets": svg_files
        },
        "assets": raster_images
    }
    return theme_profile

def generate_prompt_for_style(profile, subject="mascot coding on a laptop"):
    ink = profile["style_characteristics"]["uses_black_ink_outlines"]
    colors = ", ".join(profile["style_characteristics"]["top_theme_colors"][:4])
    
    prompt = (
        f"A Japanese seinen manga-style illustration of {subject}. "
        f"Bold black ink line art with hand-drawn hatching, screentone halftone dots, "
        f"clean cel-shading with selective color accents ({colors}), "
        f"retro tech anime aesthetic, white or transparent background, high contrast, crisp vector contour lines, "
        f"--no photorealistic, 3d render, hyperdetailed shading, noisy texture, blurry --style raw --v 6.0"
    )
    return prompt

def main():
    parser = argparse.ArgumentParser(description="Analyze theme assets and extract design style")
    parser.add_argument("path", help="Path to image file or directory of assets")
    parser.add_argument("--json", action="store_true", help="Output raw JSON analysis")
    parser.add_argument("--prompt", help="Generate a prompt for a specific subject")
    args = parser.parse_args()
    
    target = Path(args.path)
    if target.is_dir():
        profile = analyze_directory(target)
    elif target.is_file():
        profile = analyze_image(target)
    else:
        print(f"Error: {args.path} not found")
        sys.exit(1)
        
    if args.json:
        print(json.dumps(profile, indent=2))
        return
        
    print("=" * 60)
    print("THEME ASSET REVERSE-ENGINEERING REPORT")
    print("=" * 60)
    if isinstance(profile, dict) and "style_characteristics" in profile:
        style = profile["style_characteristics"]
        print(f"Directory: {profile['directory']}")
        print(f"Total Assets: {profile['asset_count']} ({profile['raster_count']} raster, {profile['svg_count']} SVG)")
        print(f"Detected Aesthetic: {style['aesthetic_classification']}")
        print(f"Ink Outlines: {'Present (Bold Manga Brush)' if style['uses_black_ink_outlines'] else 'None'}")
        print(f"Dominant Extracted Palette: {', '.join(style['top_theme_colors'])}")
        print("-" * 60)
        subj = args.prompt or "capybara mascot happily managing cloud servers"
        print("Generated AI Prompt (Midjourney / FLUX):")
        print(generate_prompt_for_style(profile, subj))
        print("=" * 60)
    else:
        print(json.dumps(profile, indent=2))

if __name__ == "__main__":
    main()

