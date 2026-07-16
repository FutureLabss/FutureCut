// ============================================================
// FutureCut — AI Processing Job API (Submit)
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne, execute } from "@/lib/db";
import { v4 as uuidv4 } from "uuid";

// Local background queue runner simulator
async function runBackgroundAIJob(jobId: string, jobType: string, projectId: string, clipId: string | null, inputData: any) {
  console.log(`[AI Worker] Starting job ${jobId} of type ${jobType}...`);
  try {
    // 1. Update job status to 'processing'
    await execute(
      "UPDATE ai_jobs SET status = 'processing', progress = 10 WHERE id = ?",
      [jobId]
    );

    // 2. Fetch project/assets info to get the media file URL if needed
    const projectRow = await queryOne<{ project_data: string }>(
      "SELECT project_data FROM projects WHERE id = ?",
      [projectId]
    );
    if (!projectRow) {
      throw new Error("Project not found");
    }

    const projectData = JSON.parse(projectRow.project_data);
    
    // We try to find the clip and its source asset
    let sourceAssetUrl = "";
    let assetName = "video.mp4";
    let clipDurationVal = 30; // fallback default

    if (clipId) {
      // Find the clip in the project structure
      let targetClip: any = null;
      if (projectData.tracks) {
        for (const track of projectData.tracks) {
          const found = track.clips?.find((c: any) => c.id === clipId);
          if (found) {
            targetClip = found;
            break;
          }
        }
      }

      if (targetClip) {
        clipDurationVal = (targetClip.sourceOutPoint ?? 10) - (targetClip.sourceInPoint ?? 0);
        // Find asset
        const assetId = targetClip.sourceId;
        // In local db, assets are stored within the project_data or query from DB.
        // Let's look for asset in the input data or project metadata.
        const asset = inputData?.asset;
        if (asset?.serverUrl) {
          sourceAssetUrl = asset.serverUrl;
          assetName = asset.fileName || "video.mp4";
        }
      }
    }

    let progress = 10;
    const progressInterval = setInterval(async () => {
      if (progress < 90) {
        progress += 15;
        await execute("UPDATE ai_jobs SET progress = ? WHERE id = ?", [Math.min(90, progress), jobId]);
      }
    }, 1200);

    let outputData: any = null;

    // 3. Process according to job type
    if (jobType === "detect_scenes") {
      // Scene boundary detection: CPU-only histogram cut detection
      // Simulation: cuts every 4 to 8 seconds depending on clip duration
      await new Promise((r) => setTimeout(r, 3000));
      const boundaries: number[] = [];
      let current = 4.2;
      while (current < clipDurationVal - 3) {
        boundaries.push(Number(current.toFixed(2)));
        current += 5.5 + Math.random() * 3;
      }
      outputData = {
        clipId,
        boundaries,
      };
    } else if (jobType === "transcribe") {
      // Speech-to-text transcription with word-level timestamps & speaker ID
      const deepgramApiKey = process.env.DEEPGRAM_API_KEY;

      if (deepgramApiKey && sourceAssetUrl) {
        console.log(`[AI Worker] Deepgram API key detected. Querying Deepgram Nova-2 for: ${sourceAssetUrl}`);
        const response = await fetch(
          "https://api.deepgram.com/v1/listen?smart_format=true&diarize=true&utterances=true&punctuate=true",
          {
            method: "POST",
            headers: {
              "Authorization": `Token ${deepgramApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: sourceAssetUrl }),
          }
        );

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Deepgram API failed: ${response.status} - ${errText}`);
        }

        const result = await response.json();
        const words: any[] = [];
        
        // Extract words from Deepgram output
        const channels = result.results?.channels || [];
        for (const channel of channels) {
          const alternatives = channel.alternatives || [];
          for (const alt of alternatives) {
            const rawWords = alt.words || [];
            for (const rw of rawWords) {
              words.push({
                text: rw.punctuated_word || rw.word,
                startTime: rw.start,
                endTime: rw.end,
                speakerId: rw.speaker !== undefined ? `Speaker ${rw.speaker + 1}` : undefined,
              });
            }
          }
        }
        
        outputData = {
          clipId,
          words: words.sort((a, b) => a.startTime - b.startTime),
        };
      } else {
        // Fallback realistic mock transcription
        console.log("[AI Worker] Using WhisperX mock fallback...");
        await new Promise((r) => setTimeout(r, 4000));
        
        const mockPhrases = [
          "Welcome to FutureCut, the advanced web video editor.",
          "In this clip, we are showcasing the latest AI editing capabilities.",
          "This includes automatic captions, aspect ratio reframing, scene boundary detection, and background noise removal.",
          "Everything runs as a background task, letting you continue editing without blocking.",
          "Let us know what you think and start creating today."
        ];

        const words: any[] = [];
        let wordTime = 0.5;

        for (let i = 0; i < mockPhrases.length; i++) {
          const phraseWords = mockPhrases[i].split(" ");
          const speakerId = i % 2 === 0 ? "Speaker 1" : "Speaker 2";

          for (const w of phraseWords) {
            if (wordTime > clipDurationVal) break;
            const duration = w.length * 0.08 + 0.15;
            words.push({
              text: w,
              startTime: Number(wordTime.toFixed(2)),
              endTime: Number((wordTime + duration).toFixed(2)),
              speakerId,
            });
            wordTime += duration + 0.1;
          }
          wordTime += 0.5; // Gap between sentences
        }

        outputData = {
          clipId,
          words,
        };
      }
    } else if (jobType === "reframe") {
      // Auto-reframe: returns crop keyframes to fit target aspect ratio
      const targetAspectRatio = inputData.targetAspectRatio || "9:16";
      
      // We simulate subject tracking. We first run scene detection
      // to avoid panning animations across hard cuts, then generate keyframes.
      await new Promise((r) => setTimeout(r, 3500));
      
      // Let's simulate cuts every 5 seconds
      const boundaries = [0];
      let t = 5;
      while (t < clipDurationVal) {
        boundaries.push(t);
        t += 5;
      }
      boundaries.push(clipDurationVal);

      const cropKeyframes: any[] = [];
      // Normalize values: center x is 0, zoom scale depends on aspect ratio
      // For 16:9 to 9:16, zoom needs to be at least 1.77 to cover height
      const scale = targetAspectRatio === "9:16" ? 1.77 : targetAspectRatio === "1:1" ? 1.0 : 1.25;

      for (let i = 0; i < boundaries.length - 1; i++) {
        const start = boundaries[i];
        const end = boundaries[i+1];
        
        // Pick a random subject center offset for this shot (e.g. subject is on the left, right, or center)
        const targetX = (Math.random() - 0.5) * 0.4; // -0.2 to +0.2 normalized offset
        
        // Insert keyframe at start of shot
        cropKeyframes.push({
          time: Number(start.toFixed(2)),
          x: Number(targetX.toFixed(3)),
          y: 0,
          scale,
        });

        // Simulate subject movement - slightly pan over the duration of the shot
        const driftX = targetX + (Math.random() - 0.5) * 0.1;
        cropKeyframes.push({
          time: Number((end - 0.05).toFixed(2)),
          x: Number(driftX.toFixed(3)),
          y: 0,
          scale,
        });
      }

      outputData = {
        clipId,
        targetAspectRatio,
        cropKeyframes,
      };
    } else if (jobType === "denoise") {
      // AI Speech Enhancement: produces a processed asset
      await new Promise((r) => setTimeout(r, 5000));
      
      // Simulate creating a new denoised asset. In production, DeepFilterNet3
      // would output a clean audio file. We return a simulated asset ID
      const processedAssetId = `denoised_${uuidv4().slice(0,8)}`;
      
      outputData = {
        clipId,
        processedAudioAssetId: processedAssetId,
        fileName: assetName.replace(/\.[^/.]+$/, "") + " (AI Enhanced).wav",
      };
    } else {
      throw new Error(`Unsupported job type: ${jobType}`);
    }

    clearInterval(progressInterval);

    // 4. Mark job as completed
    await execute(
      "UPDATE ai_jobs SET status = 'completed', progress = 100, output_data = ? WHERE id = ?",
      [JSON.stringify(outputData), jobId]
    );
    console.log(`[AI Worker] Job ${jobId} completed successfully.`);

  } catch (err: any) {
    console.error(`[AI Worker] Job ${jobId} failed:`, err);
    await execute(
      "UPDATE ai_jobs SET status = 'failed', error_message = ? WHERE id = ?",
      [err.message || "Unknown error", jobId]
    );
  }
}

// POST /api/ai/jobs — Submit an AI processing job
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, clipId, jobType, inputData } = body;

  if (!projectId || !jobType) {
    return NextResponse.json(
      { error: "projectId and jobType are required" },
      { status: 400 }
    );
  }

  const validTypes = ["transcribe", "reframe", "detect_scenes", "denoise"];
  if (!validTypes.includes(jobType)) {
    return NextResponse.json(
      { error: `Invalid jobType. Must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify project ownership
  const project = await queryOne(
    "SELECT id FROM projects WHERE id = ? AND owner_id = ?",
    [projectId, session.user.id]
  );

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const id = uuidv4();

  // Create job in the database queue
  await execute(
    "INSERT INTO ai_jobs (id, project_id, clip_id, job_type, status, progress, input_data) VALUES (?, ?, ?, ?, 'queued', 0, ?)",
    [id, projectId, clipId || null, jobType, JSON.stringify(inputData || {})]
  );

  // Trigger local background runner simulation (async, returns immediately)
  runBackgroundAIJob(id, jobType, projectId, clipId, inputData);

  return NextResponse.json(
    { id, status: "queued", progress: 0, jobType },
    { status: 201 }
  );
}
