#!/usr/bin/env python3
"""
Theme Prompt Builder: Generates precision-tuned AI generation prompts (Midjourney v6,
FLUX.1, DALL-E 3) and SVG blueprints for the reverse-engineered Manga-Tech aesthetic.
"""

import sys
import argparse

PALETTES = {
    "capybara_brown": "#af5f51",
    "capybara_dark": "#9a4f44",
    "yuzu_orange": "#fe9e5d",
    "teal_primary": "#63c8c1",
    "teal_dark": "#267b7a",
    "periwinkle": "#9ab7ff",
    "ink_black": "#0b0b0b",
    "paper_white": "#ffffff"
}

STYLES = {
    "mascot": {
        "midjourney": (
            "A Japanese manga-style character illustration of {subject}, bold black ink outlines, "
            "variable brush stroke weight, single-hatch comic shadow lines, clean flat cel shading in warm "
            "chestnut brown (#af5f51) with subtle orange and teal accents, cute minimalist eyes, transparent background, "
            "retro anime tech mascot, no gradients, no photorealism, isolated on solid white --v 6.0 --style raw --s 180"
        ),
        "flux": (
            "A clean manga line-art illustration of {subject}. Expressive Japanese comic book style, bold G-pen ink contour lines, "
            "hand-drawn diagonal shadow hatching, flat cel color palette featuring terracotta brown, soft peach, and bright teal. "
            "Crisp vector-like silhouette, solid white background, 2D commercial mascot character design."
        ),
        "dalle": (
            "An authentic Japanese manga style character illustration of {subject}. Features thick hand-inked black brush outlines, "
            "classic manga screentone shading, and minimal flat coloring with warm chestnut brown and aqua highlights. Clean white backdrop, "
            "2D vector-like clarity, charming retro anime mascot aesthetic."
        )
    },
    "background": {
        "midjourney": (
            "A wide Japanese seinen manga background scene of {subject}. Black and white ink drawing, architectural fine line art, "
            "dense 60L screentone halftone dots, dramatic diagonal panel border cut, detailed perspective, clean white highlights, "
            "classic Akira and 90s cyberpunk manga aesthetic, high contrast monochrome --ar 16:9 --v 6.0 --style raw"
        ),
        "flux": (
            "Monochrome Japanese manga background depicting {subject}. Detailed pen-and-ink architectural rendering, screentone dot shading, "
            "bold black dynamic panel borders with diagonal cutaway, clean white paper negative space, high contrast graphic novel landscape."
        ),
        "dalle": (
            "A widescreen black-and-white Japanese manga comic background illustration of {subject}. Intricate ink line work, "
            "fine halftone screentone dot textures, dramatic high-contrast composition with comic panel border cuts, professional manga background art."
        )
    },
    "badge": {
        "midjourney": (
            "A circular Japanese comic icon badge of {subject}. Thick round black ink border, bold central graphic symbol with flat color fill ({color}), "
            "hand-drawn shadow hatches, white highlight reflection slice, retro pop-art anime sticker, isolated on transparent background --v 6.0 --style raw"
        ),
        "flux": (
            "Circular comic book medallion sticker depicting {subject}. Thick concentric black ink circular frame, flat vector color fill, "
            "retro manga badge design, crisp graphic icon, clean white background."
        ),
        "dalle": (
            "A round Japanese manga style feature badge illustrating {subject}. Encased in a bold black circular ink frame with subtle pen hatch marks, "
            "simple two-tone flat coloring with crisp highlights, vector sticker icon format."
        )
    }
}

def build_prompt(asset_type, subject, engine="all", color="warm orange"):
    templates = STYLES.get(asset_type, STYLES["mascot"])
    results = {}
    
    for eng in ["midjourney", "flux", "dalle"]:
        if engine in ("all", eng):
            template = templates[eng]
            results[eng] = template.format(subject=subject, color=color)
            
    return results

def main():
    parser = argparse.ArgumentParser(description="Generate AI image prompts for the Manga-Tech theme")
    parser.add_argument("--type", choices=["mascot", "background", "badge"], default="mascot", help="Type of asset")
    parser.add_argument("--subject", default="capybara mascot wearing headphones while coding in terminal", help="Subject description")
    parser.add_argument("--engine", choices=["all", "midjourney", "flux", "dalle"], default="all", help="Target AI image engine")
    parser.add_argument("--color", default="warm yuzu orange #fe9e5d", help="Accent color for badge/icon")
    args = parser.parse_args()
    
    prompts = build_prompt(args.type, args.subject, args.engine, args.color)
    
    print(f"\n--- PROMPTS FOR {args.type.upper()}: '{args.subject}' ---")
    for eng, prompt in prompts.items():
        print(f"\n[{eng.upper()}]:\n{prompt}")
    print()

if __name__ == "__main__":
    main()

