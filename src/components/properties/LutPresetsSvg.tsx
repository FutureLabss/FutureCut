"use client";

// ============================================================
// FutureCut — LUT Presets SVG Definitions
// ============================================================
// Defines hardware-accelerated color matrices in SVG.
// Rendered at root level so the Canvas 2D context can reference
// them dynamically via filter url definitions.
// ============================================================

export function LutPresetsSvg() {
  return (
    <svg className="hidden" width="0" height="0">
      <defs>
        {/* Warm LUT: boosts reds and yellows, slightly attenuates blues */}
        <filter id="lut-warm">
          <feColorMatrix
            type="matrix"
            values="1.15  0.00  0.00  0.00  0.05
                    0.00  1.08  0.00  0.00  0.02
                    0.00  0.00  0.85  0.00  0.01
                    0.00  0.00  0.00  1.00  0.00"
          />
        </filter>

        {/* Cool LUT: boosts blues, suppresses reds */}
        <filter id="lut-cool">
          <feColorMatrix
            type="matrix"
            values="0.85  0.00  0.00  0.00  0.00
                    0.00  0.95  0.00  0.00  0.02
                    0.00  0.00  1.25  0.00  0.05
                    0.00  0.00  0.00  1.00  0.00"
          />
        </filter>

        {/* Vintage LUT: nostalgic faded warm sepia-like color mapping */}
        <filter id="lut-vintage">
          <feColorMatrix
            type="matrix"
            values="0.95  0.05  0.00  0.00  0.08
                    0.00  0.85  0.05  0.00  0.05
                    0.05  0.00  0.70  0.00  0.03
                    0.00  0.00  0.00  1.00  0.00"
          />
        </filter>

        {/* High Contrast B&W LUT: fully desaturated luminances */}
        <filter id="lut-bw">
          <feColorMatrix
            type="matrix"
            values="0.33  0.33  0.33  0.00  0.00
                    0.33  0.33  0.33  0.00  0.00
                    0.33  0.33  0.33  0.00  0.00
                    0.00  0.00  0.00  1.00  0.00"
          />
        </filter>
      </defs>
    </svg>
  );
}
