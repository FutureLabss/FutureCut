// ============================================================
// FutureCut — GPU WebGL Compositor with 2D Fallback
// ============================================================
// Performs hardware-accelerated texture composition of video layers,
// keyframe transformations, opacity, and color filters using WebGL/WebGL2.
// If WebGL is unsupported or context is lost, degrades gracefully
// to an Offscreen 2D Canvas fallback to prevent playback stuttering.
// ============================================================

import type { Filter } from "../model/types";

export interface LayerBitmap {
  trackId: string;
  clipId: string;
  bitmap: ImageBitmap | null;
  opacity: number;
  posX: number;
  posY: number;
  scale: number;
  rotation: number;
  filters: Filter[];
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  uniform vec2 u_resolution;
  uniform vec2 u_translation;
  uniform vec2 u_scale;
  uniform float u_rotation;
  varying vec2 v_texCoord;

  void main() {
    // Rotation
    float c = cos(u_rotation);
    float s = sin(u_rotation);
    mat2 rotationMat = mat2(c, -s, s, c);
    
    vec2 scaledPos = a_position * u_scale;
    vec2 rotatedPos = rotationMat * scaledPos;
    vec2 position = rotatedPos + u_translation;

    // Convert pixel position to 0.0 -> 1.0 -> -1.0 -> +1.0
    vec2 zeroToOne = position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;

    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;
  uniform sampler2D u_image;
  uniform float u_opacity;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  varying vec2 v_texCoord;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    
    // Brightness adjustment
    color.rgb += u_brightness;

    // Contrast adjustment
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // Saturation adjustment
    float gray = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    color.rgb = mix(vec3(gray), color.rgb, u_saturation);

    color.a *= u_opacity;
    gl_FragColor = color;
  }
`;

export class GpuCompositor {
  private gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;
  private isDegraded2D = false;
  private ctx2D: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    this.initGL();
  }

  get isFallback(): boolean {
    return this.isDegraded2D;
  }

  /**
   * Initializes WebGL context and compiles shaders.
   */
  private initGL(): void {
    try {
      const gl = (this.canvas.getContext("webgl") ||
        (this.canvas as HTMLCanvasElement).getContext?.("experimental-webgl")) as WebGLRenderingContext | null;

      if (!gl) {
        throw new Error("WebGL context not available");
      }

      this.gl = gl;

      // Compile shaders
      const vertShader = this.createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
      const fragShader = this.createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

      if (!vertShader || !fragShader) {
        throw new Error("Shader compilation failed");
      }

      const program = gl.createProgram();
      if (!program) throw new Error("Program creation failed");

      gl.attachShader(program, vertShader);
      gl.attachShader(program, fragShader);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("Program link failed: " + gl.getProgramInfoLog(program));
      }

      this.program = program;

      // Create buffers
      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      // Unit quad centered at origin
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -0.5, -0.5,
           0.5, -0.5,
          -0.5,  0.5,
          -0.5,  0.5,
           0.5, -0.5,
           0.5,  0.5,
        ]),
        gl.STATIC_DRAW
      );

      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          0.0, 0.0,
          1.0, 0.0,
          0.0, 1.0,
          0.0, 1.0,
          1.0, 0.0,
          1.0, 1.0,
        ]),
        gl.STATIC_DRAW
      );

      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

      // Handle GL context loss
      if (this.canvas instanceof HTMLCanvasElement) {
        this.canvas.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
          console.warn("WebGL context lost! Degrading to 2D Canvas fallback.");
          this.fallbackTo2D();
        });
      }
    } catch (err) {
      console.warn("Failed to initialize WebGL compositor, degrading to 2D Canvas:", err);
      this.fallbackTo2D();
    }
  }

  /**
   * Activates 2D Canvas fallback rendering.
   */
  private fallbackTo2D(): void {
    this.isDegraded2D = true;
    this.gl = null;
    this.ctx2D = this.canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  }

  /**
   * Renders composite layers onto the canvas.
   */
  render(layers: LayerBitmap[], width: number, height: number): void {
    if (this.isDegraded2D || !this.gl || !this.program) {
      this.render2DFallback(layers, width, height);
      return;
    }

    const gl = this.gl;
    gl.viewport(0, 0, width, height);

    // Clear background to black
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Enable alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.program);

    const uResolution = gl.getUniformLocation(this.program, "u_resolution");
    const uTranslation = gl.getUniformLocation(this.program, "u_translation");
    const uScale = gl.getUniformLocation(this.program, "u_scale");
    const uRotation = gl.getUniformLocation(this.program, "u_rotation");
    const uOpacity = gl.getUniformLocation(this.program, "u_opacity");
    const uBrightness = gl.getUniformLocation(this.program, "u_brightness");
    const uContrast = gl.getUniformLocation(this.program, "u_contrast");
    const uSaturation = gl.getUniformLocation(this.program, "u_saturation");

    gl.uniform2f(uResolution, width, height);

    // Bind vertex attribute buffers
    const aPosition = gl.getAttribLocation(this.program, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    const aTexCoord = gl.getAttribLocation(this.program, "a_texCoord");
    gl.enableVertexAttribArray(aTexCoord);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

    for (const layer of layers) {
      if (!layer.bitmap) continue;

      // Upload bitmap texture to GPU
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, layer.bitmap);

      // Compute transform values
      const drawW = layer.bitmap.width;
      const drawH = layer.bitmap.height;
      const posX = width / 2 + layer.posX * width;
      const posY = height / 2 + layer.posY * height;

      gl.uniform2f(uTranslation, posX, posY);
      gl.uniform2f(uScale, drawW * layer.scale, drawH * layer.scale);
      gl.uniform1f(uRotation, (layer.rotation * Math.PI) / 180);
      gl.uniform1f(uOpacity, layer.opacity);

      // Calculate filter adjustments
      let brightness = 0.0;
      let contrast = 1.0;
      let saturation = 1.0;

      for (const filter of layer.filters) {
        if (filter.type === "brightness") brightness += filter.value;
        if (filter.type === "contrast") contrast *= 1.0 + filter.value;
        if (filter.type === "saturation") saturation *= 1.0 + filter.value;
      }

      gl.uniform1f(uBrightness, brightness);
      gl.uniform1f(uContrast, contrast);
      gl.uniform1f(uSaturation, saturation);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  /**
   * 2D Canvas fallback renderer for legacy or no-GPU hardware.
   */
  private render2DFallback(layers: LayerBitmap[], width: number, height: number): void {
    if (!this.ctx2D) return;
    const ctx = this.ctx2D;

    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    for (const layer of layers) {
      if (!layer.bitmap) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity;

      const drawW = layer.bitmap.width * layer.scale;
      const drawH = layer.bitmap.height * layer.scale;
      const posX = width / 2 + layer.posX * width;
      const posY = height / 2 + layer.posY * height;

      ctx.translate(posX, posY);
      ctx.rotate((layer.rotation * Math.PI) / 180);

      // Build CSS filter string
      let filterStr = "";
      for (const filter of layer.filters) {
        if (filter.type === "brightness") filterStr += `brightness(${100 + filter.value * 100}%) `;
        if (filter.type === "contrast") filterStr += `contrast(${100 + filter.value * 100}%) `;
        if (filter.type === "saturation") filterStr += `saturate(${100 + filter.value * 100}%) `;
      }

      if (filterStr) {
        ctx.filter = filterStr.trim();
      }

      ctx.drawImage(layer.bitmap, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    }
  }

  private createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
