# SVG & CSS Implementation Recipes: Manga-Tech System

Ready-to-use SVG templates and CSS/Tailwind utilities reverse-engineered from the theme.

---

## 1. Repeating Screentone Tile SVGs

### Halftone Parallelogram Tile (`sidebar-bg-tile.svg`)
Use this vector pattern for sidebars, hero strips, and modal backdrops:

```xml
<svg width="110" height="70" viewBox="0 0 110 70" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g opacity="0.08">
    <path d="M16.2359 0L15.4406 4.70011H0L0.795226 0H16.2359Z" fill="#FFFFFF"/>
    <path d="M37.2359 0L36.4406 4.70011H21L21.7952 0H37.2359Z" fill="#FFFFFF"/>
    <path d="M58.2359 0L57.4406 4.70011H42L42.7952 0H58.2359Z" fill="#FFFFFF"/>
    <path d="M79.2359 0L78.4406 4.70011H63L63.7952 0H79.2359Z" fill="#FFFFFF"/>
    <path d="M100.236 0L99.4406 4.70011H84L84.7952 0H100.236Z" fill="#FFFFFF"/>
  </g>
</svg>
```

### Staggered Brick Screentone Tile (`sidebar-bg-tile-brick.svg`)
Adds alternating offset rows for subtle industrial/brick texture:

```xml
<svg width="110" height="140" viewBox="0 0 110 140" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Row 1 -->
  <g opacity="0.08">
    <path d="M16.23 0L15.44 4.7H0L0.79 0H16.23Z" fill="#FFFFFF"/>
    <path d="M37.23 0L36.44 4.7H21L21.79 0H37.23Z" fill="#FFFFFF"/>
    <path d="M58.23 0L57.44 4.7H42L42.79 0H58.23Z" fill="#FFFFFF"/>
    <path d="M79.23 0L78.44 4.7H63L63.79 0H79.23Z" fill="#FFFFFF"/>
    <path d="M100.23 0L99.44 4.7H84L84.79 0H100.23Z" fill="#FFFFFF"/>
  </g>
  <!-- Row 2: 10.5px Stagger Offset -->
  <g opacity="0.08" transform="translate(10.5, 35)">
    <path d="M16.23 0L15.44 4.7H0L0.79 0H16.23Z" fill="#FFFFFF"/>
    <path d="M37.23 0L36.44 4.7H21L21.79 0H37.23Z" fill="#FFFFFF"/>
    <path d="M58.23 0L57.44 4.7H42L42.79 0H58.23Z" fill="#FFFFFF"/>
    <path d="M79.23 0L78.44 4.7H63L63.79 0H79.23Z" fill="#FFFFFF"/>
    <path d="M100.23 0L99.44 4.7H84L84.79 0H100.23Z" fill="#FFFFFF"/>
  </g>
</svg>
```

---

## 2. Circular Comic Badge SVG Template

Standard 250 × 250 vector medallion with bold ink boundary and optional accent:

```xml
<svg width="250" height="250" viewBox="0 0 250 250" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer Black Ink Boundary -->
  <circle cx="125" cy="125" r="116" fill="#0B0B0B" stroke="#000000" stroke-width="4"/>
  
  <!-- Colored Inner Ring -->
  <circle cx="125" cy="125" r="108" fill="#0B9F95"/>
  
  <!-- Inset Shadow Hatching (Simulated) -->
  <path d="M 25 125 A 100 100 0 0 0 225 125" stroke="#000000" stroke-width="3" stroke-dasharray="4 6" fill="none" opacity="0.4"/>
  
  <!-- Center Icon Slot (e.g. Card, Briefcase, Mascot) -->
  <g transform="translate(45, 45)">
    <!-- Your vector icon paths here -->
  </g>
  
  <!-- White Specular Curved Highlight -->
  <path d="M 50 60 A 90 90 0 0 1 120 38" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" opacity="0.6"/>
</svg>
```

---

## 3. CSS / Tailwind Components

### Neo-Brutalist Manga Primary Button
```css
.manga-btn-primary {
  background-color: #63c8c1;
  color: #000000;
  font-family: 'Bebas Neue', Impact, sans-serif;
  font-size: 1.25rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-weight: 700;
  border: 1.5px solid #267b7a;
  box-shadow: -3px 3px 0 0 #267b7a;
  transition: all 0.15s ease-out;
}

.manga-btn-primary:hover {
  transform: translate(2px, -2px);
  box-shadow: 0 0 0 0 #267b7a;
  background-color: #72d6cf;
}
```

### Manga Comic Card Panel
```css
.manga-panel {
  background-color: #090a0d;
  border: 2px solid #22262e;
  border-radius: 0.75rem;
  position: relative;
  transition: border-color 0.2s ease, transform 0.2s ease;
}

.manga-panel:hover {
  border-color: #404856;
}
```

### Manga Halftone Screen Background
```css
.manga-brick-bg {
  background-image: url('/assets/theme/sidebar-bg-tile-brick.svg');
  background-size: 2.4rem auto;
  background-repeat: repeat;
}
```

